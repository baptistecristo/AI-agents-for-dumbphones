"""Pipeline vocal auto-hébergé (option B du doc d'archi, §2-3) :

  téléphone -> websocket média -> VAD Silero -> faster-whisper (STT, local)
            -> LLM (Ollama local / Mistral EU / Claude) -> Piper (TTS, serveur local)
            -> websocket média -> téléphone

Piper tourne dans son propre serveur HTTP (voir piper_http.py et le README) ;
tout le reste est en processus.

Testé avec pipecat-ai 1.5 (voir la version épinglée dans requirements.txt).
"""

import asyncio
import os
import sys

import httpx
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import EndTaskFrame, TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.transcriptions.language import Language
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.workers.runner import WorkerRunner

import api_client
import config
import stt as stt_provider
import tools as tool_defs
import twilio_media
from piper_http import PiperHttpTTSService, speakable_text

logger.remove()
# LOG_LEVEL=DEBUG fait parler tout Pipecat : VAD, transcriptions, trames LLM.
# C'est l'outil de diagnostic quand un appel reste muet — voir runtime/README.md.
logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))

# Annonce de fin quand MAX_CALL_SECONDS est atteint : dite dans la langue de la
# session, PUIS on laisse le temps de la prononcer avant de raccrocher.
_TIMEOUT_GOODBYE = {
    "fr": "On arrive à la limite de durée de cet appel. Merci, à bientôt !",
    "en": "We are reaching this call's time limit. Thank you, talk soon!",
    "es": "Llegamos al límite de duración de esta llamada. ¡Gracias, hasta pronto!",
}
_TIMEOUT_GOODBYE_SECONDS = 8  # marge pour que l'annonce parte sur la ligne avant la coupure

# Silence, côté appelant, après que l'agent a fini de parler. 12 s : assez long
# pour ne pas bousculer quelqu'un qui réfléchit, assez court pour qu'on ne
# croie pas la ligne coupée. Sous ~8 s on relance des gens qui cherchent leurs
# mots. Repris du hook `customer.speech.timeout` de l'agent Alain.
IDLE_RELANCE_SECONDS = 12.0
# Deux relances au maximum, puis on se tait : au-delà, insister sur une ligne
# sans réponse c'est du harcèlement, et MAX_CALL_SECONDS finira l'appel.
IDLE_RELANCE_MAX = 2
_IDLE_RELANCES = {
    "fr": ["Je suis toujours là, prenez votre temps.", "Je vous écoute, rien ne presse."],
    "en": ["I'm still here, take your time.", "I'm listening, there's no rush."],
    "es": ["Sigo aquí, tómate tu tiempo.", "Te escucho, no hay prisa."],
}

# Dit pendant qu'un outil travaille. Le modèle annonce parfois lui-même qu'il
# cherche, parfois non, et le blanc dure alors tout l'appel réseau. Une ligne
# muette pendant trois secondes se lit comme un appel coupé.
_THINKING = {
    "fr": "Un instant, je regarde.",
    "en": "One moment, let me check.",
    "es": "Un momento, lo miro.",
}
# Outils qui ne partent sur aucun réseau : annoncer une attente qui n'existe
# pas est pire que le silence. end_call en tête — dire « un instant, je
# regarde » juste avant de raccrocher s'entend comme un bug.
_SILENT_TOOLS = frozenset({"end_call"})


def _build_llm():
    """Cerveau de l'agent, au choix (LLM_PROVIDER) — interface unique OpenAI-compatible."""
    if config.LLM_PROVIDER == "anthropic":
        from pipecat.services.anthropic.llm import AnthropicLLMService

        return AnthropicLLMService(api_key=config.ANTHROPIC_API_KEY, model=config.ANTHROPIC_MODEL)
    if config.LLM_PROVIDER == "mistral":
        from pipecat.services.openai.llm import OpenAILLMService

        return OpenAILLMService(
            api_key=config.MISTRAL_API_KEY,
            base_url="https://api.mistral.ai/v1",
            model=config.MISTRAL_MODEL,
        )
    # Défaut : 100 % local via Ollama (endpoint OpenAI-compatible)
    from pipecat.services.ollama.llm import OLLamaLLMService

    return OLLamaLLMService(model=config.OLLAMA_MODEL, base_url=config.OLLAMA_URL)


def _transcript_from(context: LLMContext) -> str:
    lines: list[str] = []
    for message in context.get_messages():
        role = message.get("role")
        content = message.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            speaker = "Utilisateur" if role == "user" else "Agent"
            lines.append(f"{speaker} : {content.strip()}")
    return "\n".join(lines)


# Construire un service STT est immédiat : le modèle Whisper est partagé par
# tout le processus (whisper_stt.shared_model), et Deepgram n'a rien à charger.
# Il y avait ici une mécanique d'« avance » qui rechargeait un modèle entre les
# appels ; elle causait exactement la panne qu'elle prétendait éviter, en
# consommant le CPU dont l'audio en cours avait besoin. Supprimée.


async def build_stt(stt_language: Language):
    """Service STT prêt à brancher dans le pipeline."""
    return await asyncio.to_thread(stt_provider.build_service, stt_language)


async def preload_stt() -> None:
    """Charge le modèle au démarrage, pour que le premier appel n'attende pas.

    Jamais fatal : sans réseau ni modèle en cache, le runtime doit démarrer
    quand même. Le premier appel paiera alors le chargement.
    """
    if not stt_provider.loads_a_model():
        return
    try:
        await build_stt(stt_provider.stt_language_for("fr"))
        logger.info(f"Modèle Whisper « {config.WHISPER_MODEL} » prêt.")
    except Exception as err:  # noqa: BLE001
        logger.warning(f"Chargement Whisper impossible ({err}) : l'appel le chargera lui-même.")


async def _speak_greeting_now(websocket, stream_sid: str, text: str, voice: str) -> bool:
    """Prononce l'accueil AVANT la construction du pipeline.

    Décrocher, c'est parler tout de suite : entre l'ouverture du flux et le
    premier mot du pipeline, il y a le chargement du modèle Whisper — plusieurs
    secondes de silence au décroché, que l'appelant prend pour une ligne morte.
    Ici on synthétise l'accueil en un POST Piper direct et on l'envoie sur la
    ligne immédiatement ; Whisper charge PENDANT que l'accueil se joue.
    En échec (Piper pas prêt), on rend False et l'accueil repasse par le
    pipeline, comme avant : plus lent, jamais muet.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{config.PIPER_BASE_URL}{config.PIPER_SYNTHESIZE_PATH}",
                json={"text": speakable_text(text), "voice": voice},
            )
            res.raise_for_status()
            ulaw = twilio_media.wav_to_ulaw(res.content)
        for frame in twilio_media.iter_frames(ulaw):
            await websocket.send_text(twilio_media.dumps(twilio_media.media_event(stream_sid, frame)))
        return True
    except Exception as err:  # noqa: BLE001 — l'accueil ne doit jamais tuer l'appel
        logger.warning(f"Accueil immédiat impossible ({err}) : il repassera par le pipeline.")
        return False


async def run_call(
    websocket,
    serializer,
    call_id: str,
    direction: str,
    caller_number: str | None = None,
    job_id: str | None = None,
    demo_name: str | None = None,
    demo_lang: str | None = None,
    stream_sid: str | None = None,
) -> None:
    """Fait tourner un appel complet (entrant ou mission sortante)."""

    # 1. Session côté Next.js : prompt système personnalisé + message d'accueil
    session = await api_client.open_session(
        call_id, direction, caller_number, job_id, demo_name, demo_lang
    )
    job_id = session.get("job_id") or job_id

    # Langue de la session ("fr" | "en" | "es") : pilote la voix Piper ET la
    # langue Whisper (voir stt_language_for).
    language = session.get("language", "fr")
    stt_language = stt_provider.stt_language_for(language)

    # Accueil immédiat, avant tout le reste (voir _speak_greeting_now).
    first = session.get("first_message")
    greeted = False
    if first and direction == "inbound" and stream_sid:
        greeted = await _speak_greeting_now(
            websocket, stream_sid, first, config.piper_voice_for(language)
        )

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    stt = await build_stt(stt_language)

    # Voix Piper monolingue : elle reste fixe pendant tout l'appel (voir README).
    # La synthèse tourne dans un serveur Piper séparé (config.PIPER_BASE_URL) :
    # le runtime n'embarque pas `piper-tts`. Voir piper_http.py.
    #
    # La route est lue sur `config` à CHAQUE appel, et non importée une fois pour
    # toutes : le démarrage de server.py y écrit la route effectivement détectée
    # (PIPER_SYNTHESIZE_PATH=auto), et `from config import ...` figerait la
    # valeur d'avant détection.
    tts = PiperHttpTTSService(
        base_url=config.PIPER_BASE_URL,
        synthesize_path=config.PIPER_SYNTHESIZE_PATH,
        settings=PiperHttpTTSService.Settings(voice=config.piper_voice_for(language)),
    )

    llm = _build_llm()

    context = LLMContext(
        # Accueil déjà prononcé hors pipeline : l'agrégateur assistant ne l'a
        # pas vu passer, on le pose donc dans le contexte à la main.
        messages=[{"role": "system", "content": session["system_prompt"]}]
        + ([{"role": "assistant", "content": first}] if greeted else []),
        # Appelant sans compte : schéma d'outils réduit au périmètre public
        # (tools.PUBLIC_TOOLS), en face du prompt compact renvoyé par l'API.
        tools=(
            tool_defs.inbound_tools(known_caller=session.get("known_caller", True))
            if direction == "inbound"
            else tool_defs.outbound_tools()
        ),
    )
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    # min_volume est un ET avec la confiance Silero : sous ce
                    # seuil, la trame est jetée quoi que Silero en pense, et
                    # SANS une ligne de log. Un micro discret rendait donc
                    # l'agent sourd sans laisser de trace. On laisse Silero
                    # décider seul, c'est son métier.
                    min_volume=0.0,
                    # Le début de tour déclenche l'interruption immédiatement,
                    # sans compte de mots ni transcription : 0,2 s de bruit
                    # suffisaient à couper l'agent. 0,3 s et une confiance plus
                    # haute écartent la toux et la porte, et coûtent 100 ms sur
                    # une vraie interruption.
                    start_secs=0.3,
                    confidence=0.8,
                    # N'ARRÊTE PAS le tour de parole : c'est le modèle
                    # smart-turn qui en décide. Ne fait que clore un SEGMENT
                    # audio, et chaque segment coûte un décodage Whisper entier.
                    # Doubler ce délai, c'est moitié moins de décodages sur
                    # quelqu'un qui hésite.
                    stop_secs=0.4,
                ),
            ),
            # Silence après le tour de l'agent : au-delà, il relance au lieu de
            # laisser une ligne morte. Sur un téléphone sans écran, un blanc ne
            # se distingue pas d'un appel coupé.
            user_idle_timeout=IDLE_RELANCE_SECONDS,
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            aggregators.user(),
            llm,
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )

    worker = PipelineWorker(
        pipeline,
        name=f"call-{call_id[:8]}",
        # Métriques ON : sans elles, on ne peut pas dire si l'attente vient de
        # Whisper, du LLM ou de Piper, et on règle à l'aveugle. Les deux services
        # locaux savent les produire (can_generate_metrics), ça ne coûte que du log.
        params=PipelineParams(enable_metrics=True),
    )
    runner = WorkerRunner(handle_sigint=False)

    async def hangup() -> None:
        await worker.queue_frame(EndTaskFrame())

    llm.register_function(None, tool_defs.make_tool_handler(call_id, job_id, hangup))

    @llm.event_handler("on_function_calls_started")
    async def on_function_calls_started(_service, function_calls) -> None:
        # Pas de mot d'attente pour ce qui ne fait rien attendre. Vu en test :
        # « Un instant, je regarde. » juste avant de raccrocher sur end_call.
        names = {getattr(call, "function_name", "") for call in function_calls or []}
        if not names - _SILENT_TOOLS:
            return
        await worker.queue_frames([TTSSpeakFrame(_THINKING.get(language, _THINKING["fr"]))])

    # Relance sur silence : bornée, et remise à zéro dès que l'appelant reparle,
    # sinon l'agent répète sa relance à quelqu'un qui a simplement raccroché.
    idle_relances = 0

    @aggregators.user().event_handler("on_user_turn_idle")
    async def on_user_turn_idle(_aggregator) -> None:
        nonlocal idle_relances
        if idle_relances >= IDLE_RELANCE_MAX:
            return
        phrases = _IDLE_RELANCES.get(language, _IDLE_RELANCES["fr"])
        await worker.queue_frames([TTSSpeakFrame(phrases[idle_relances % len(phrases)])])
        idle_relances += 1

    @aggregators.user().event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(_aggregator, *_args) -> None:
        nonlocal idle_relances
        idle_relances = 0

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport, _client) -> None:
        # Entrant : l'agent parle en premier. Chemin de repli seulement — en
        # temps normal l'accueil est déjà parti AVANT le pipeline (greeted).
        # Pas de context.add_message ici : l'agrégateur assistant enregistre ce
        # que le TTS prononce — l'ajouter à la main doublerait l'accueil.
        if first and not greeted:
            await worker.queue_frames([TTSSpeakFrame(first)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport, _client) -> None:
        await runner.cancel()

    # Limite de durée (MAX_CALL_SECONDS, 0 = sans limite) : l'agent annonce la
    # fin dans la langue de la session, puis raccroche — le pendant self-host du
    # maxDurationSeconds de Vapi. L'annonce part AVANT la coupure : la marge
    # _TIMEOUT_GOODBYE_SECONDS laisse au TTS et à la ligne le temps de la dire.
    async def _enforce_max_duration(max_seconds: int) -> None:
        await asyncio.sleep(max(1, max_seconds - _TIMEOUT_GOODBYE_SECONDS))
        goodbye = _TIMEOUT_GOODBYE.get(language, _TIMEOUT_GOODBYE["fr"])
        logger.info(f"Appel {call_id} : limite de {max_seconds}s atteinte, annonce puis raccrochage")
        await worker.queue_frames([TTSSpeakFrame(goodbye)])
        await asyncio.sleep(_TIMEOUT_GOODBYE_SECONDS)
        await hangup()

    watchdog = (
        asyncio.create_task(_enforce_max_duration(config.MAX_CALL_SECONDS))
        if config.MAX_CALL_SECONDS > 0
        else None
    )

    try:
        await runner.add_workers(worker)
        await runner.run()
    finally:
        if watchdog:
            watchdog.cancel()
        # 3. Fin d'appel : transcript + clôture éventuelle de la mission
        try:
            await api_client.end_call(call_id, _transcript_from(context), "hangup", job_id)
        except Exception as err:  # noqa: BLE001
            logger.error(f"end_call a échoué pour {call_id}: {err}")
