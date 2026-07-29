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

from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndTaskFrame, TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transcriptions.language import Language
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.workers.runner import WorkerRunner

import api_client
import config
import tools as tool_defs
from piper_http import PiperHttpTTSService

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


async def run_call(
    websocket,
    serializer,
    call_id: str,
    direction: str,
    caller_number: str | None = None,
    job_id: str | None = None,
) -> None:
    """Fait tourner un appel complet (entrant ou mission sortante)."""

    # 1. Session côté Next.js : prompt système personnalisé + message d'accueil
    session = await api_client.open_session(call_id, direction, caller_number, job_id)
    job_id = session.get("job_id") or job_id

    # Langue de la session ("fr" | "en" | "es") : pilote la voix Piper ET la langue
    # Whisper. STT épinglé (pas d'auto-détection) : le WhisperSTTService de Pipecat
    # exige une langue concrète — run_stt fait assert_given(settings.language).
    language = session.get("language", "fr")
    stt_language = {"en": Language.EN, "es": Language.ES}.get(language, Language.FR)

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    stt = WhisperSTTService(
        device=config.WHISPER_DEVICE,
        settings=WhisperSTTService.Settings(
            model=config.WHISPER_MODEL,
            language=stt_language,
        ),
    )

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
        messages=[{"role": "system", "content": session["system_prompt"]}],
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
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
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
        params=PipelineParams(enable_metrics=False),
    )
    runner = WorkerRunner(handle_sigint=False)

    async def hangup() -> None:
        await worker.queue_frame(EndTaskFrame())

    llm.register_function(None, tool_defs.make_tool_handler(call_id, job_id, hangup))

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport, _client) -> None:
        # Entrant : l'agent parle en premier. Sortant : on attend l'interlocuteur.
        # Pas de context.add_message ici : l'agrégateur assistant enregistre déjà
        # ce que le TTS prononce — l'ajouter à la main doublait l'accueil dans le
        # contexte envoyé au LLM.
        first = session.get("first_message")
        if first:
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
