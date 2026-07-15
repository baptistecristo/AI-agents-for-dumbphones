"""Pipeline vocal auto-hébergé (option B du doc d'archi, §2-3) :

  téléphone -> websocket média -> VAD Silero -> faster-whisper (STT, local)
            -> LLM (Ollama local / Mistral EU / Claude) -> Piper (TTS, local)
            -> websocket média -> téléphone

Testé avec pipecat-ai 1.5 (voir la version épinglée dans requirements.txt).
"""

import sys
from pathlib import Path

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
from pipecat.services.piper.tts import PiperTTSService
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

logger.remove()
logger.add(sys.stderr, level="INFO")


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

    # Langue de la session ("fr" | "en") : pilote la voix Piper ET la langue Whisper.
    # STT épinglé (pas d'auto-détection) : le WhisperSTTService de Pipecat exige une
    # langue concrète — run_stt fait assert_given(settings.language) avant transcribe.
    language = session.get("language", "fr")
    stt_language = Language.EN if language == "en" else Language.FR

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
    tts = PiperTTSService(
        voice_id=config.piper_voice_for(language),
        download_dir=Path(__file__).parent / "models",
    )

    llm = _build_llm()

    context = LLMContext(
        messages=[{"role": "system", "content": session["system_prompt"]}],
        tools=tool_defs.inbound_tools() if direction == "inbound" else tool_defs.outbound_tools(),
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
        first = session.get("first_message")
        if first:
            context.add_message({"role": "assistant", "content": first})
            await worker.queue_frames([TTSSpeakFrame(first)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport, _client) -> None:
        await runner.cancel()

    try:
        await runner.add_workers(worker)
        await runner.run()
    finally:
        # 3. Fin d'appel : transcript + clôture éventuelle de la mission
        try:
            await api_client.end_call(call_id, _transcript_from(context), "hangup", job_id)
        except Exception as err:  # noqa: BLE001
            logger.error(f"end_call a échoué pour {call_id}: {err}")
