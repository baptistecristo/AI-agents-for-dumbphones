"""Whisper sur une ligne téléphonique : rééchantillonner avant de transcrire.

Le bug, et il explique à lui seul toutes les transcriptions absurdes du
projet : `WhisperSTTService.run_stt` passe le tampon audio à faster-whisper
tel quel.

    audio_float = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = await asyncio.to_thread(self._model.transcribe, audio_float, ...)

`transcribe()` n'a pas de paramètre de fréquence : un tableau numpy est
TOUJOURS interprété comme du 16 kHz. Or une ligne téléphonique, c'est du
8 kHz (G.711), et le service hérite cette fréquence du transport
(`self._sample_rate = frame.audio_in_sample_rate`). Whisper reçoit donc une
voix jouée à moitié vitesse, une octave plus bas, et décode consciencieusement
ce qu'il entend : du français plausible, jamais le bon.

    « Quel temps fait-il à Lyon aujourd'hui ? »
      8 kHz brut          -> « C'est bon fait, il est là aujourd'hui. »
      rééchantillonné     -> « Quel temps fait-il à Lyon aujourd'hui ? »

Ce n'est pas un problème de taille de modèle. `medium` retrouvait « à Lyon »
parce qu'un gros modèle encaisse mieux la distorsion, au prix d'une dizaine de
secondes par tour : on payait cher pour compenser un bug d'une ligne.

`initial_prompt` en plus, lui, ne corrige rien : il oriente. Whisper conditionne
son décodage sur ce texte, et lui donner le registre de l'appel (questions
courtes, tutoiement, noms de villes) aide sur les mots que la bande passante
téléphonique laisse ambigus, même une fois la fréquence remise d'équerre.
"""

import asyncio
from collections.abc import AsyncGenerator

import numpy as np
from loguru import logger
from pipecat.audio.resamplers.soxr_resampler import SOXRAudioResampler
from pipecat.frames.frames import ErrorFrame, Frame, TranscriptionFrame
from pipecat.services.settings import assert_given
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transcriptions.language import Language
from pipecat.utils.time import time_now_iso8601

# Fréquence attendue par faster-whisper pour une entrée numpy. Non négociable :
# elle n'est pas un paramètre de transcribe(), c'est une convention.
WHISPER_SAMPLE_RATE = 16000

# Le registre de l'appel, pas un script. Ces phrases ne sont pas imposées :
# elles indiquent le vocabulaire et la tournure attendus. Les villes ancrent la
# CLASSE « nom de ville », celle que la bande téléphonique brouille le plus.
INITIAL_PROMPT: dict[str, str] = {
    "fr": (
        "Quel temps fait-il à Lyon aujourd'hui ? Quelle heure est-il à Tokyo ? "
        "Convertis cent euros en dollars. Rappelle-moi de sortir le pain du four à midi. "
        "Comment j'y vais depuis Marseille ? Envoie un message à Claire."
    ),
    "en": (
        "What's the weather like in London today? What time is it in Tokyo? "
        "Convert a hundred euros into dollars. Remind me to take the bread out at noon. "
        "How do I get there from Manchester? Send a message to Claire."
    ),
    "es": (
        "¿Qué tiempo hace hoy en Sevilla? ¿Qué hora es en Tokio? "
        "Convierte cien euros en dólares. Recuérdame sacar el pan del horno a mediodía. "
        "¿Cómo llego desde Valencia? Envía un mensaje a Clara."
    ),
}


def initial_prompt_for(language: Language | str) -> str:
    """Amorce de décodage dans la langue de la session."""
    return INITIAL_PROMPT.get(str(language), INITIAL_PROMPT["fr"])


class PhoneWhisperSTTService(WhisperSTTService):
    """WhisperSTTService qui rééchantillonne l'audio avant de le transcrire.

    `run_stt` est recopié depuis l'amont : la version d'origine construit son
    appel à `transcribe` en dur, sans crochet pour l'enrichir. Deux lignes
    changent (le rééchantillonnage et les options passées à transcribe) ; tout
    le reste suit Pipecat 1.5.0 et devra être resynchronisé s'il évolue.
    """

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._resampler = SOXRAudioResampler()

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        """Transcrit un tour de parole, ramené à la fréquence de Whisper."""
        if not self._model:
            yield ErrorFrame("Whisper model not available")
            return

        await self.start_processing_metrics()

        if self.sample_rate != WHISPER_SAMPLE_RATE:
            audio = await self._resampler.resample(audio, self.sample_rate, WHISPER_SAMPLE_RATE)

        # Divisé par 32768 : données signées sur 16 bits (comme en amont).
        audio_float = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0

        language = assert_given(self._settings.language)
        segments, _ = await asyncio.to_thread(
            lambda: self._model.transcribe(
                audio_float,
                language=language,
                initial_prompt=initial_prompt_for(language),
                condition_on_previous_text=False,
            )
        )

        text: str = ""
        no_speech_prob_threshold = assert_given(self._settings.no_speech_prob)
        for segment in segments:
            if (
                no_speech_prob_threshold is not None
                and segment.no_speech_prob < no_speech_prob_threshold
            ):
                text += f"{segment.text} "

        await self.stop_processing_metrics()

        if text:
            await self._handle_transcription(text, True, language)
            logger.debug(f"Transcription: [{text}]")
            yield TranscriptionFrame(text, self._user_id, time_now_iso8601(), language)
