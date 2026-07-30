"""Whisper réglé pour la ligne téléphonique : garde de fréquence et vocabulaire.

⚠️ Correction d'une explication fausse écrite ici le 30/07/2026, et gardée en
mémoire pour que personne ne la ré-invente. On avait conclu que le pipeline
livrait du 8 kHz brut à faster-whisper (qui lit TOUJOURS un tableau numpy comme
du 16 kHz), et que c'était la cause des transcriptions absurdes. Mesuré depuis,
dans un vrai appel : `self.sample_rate` vaut **16000**. Le sérialiseur Twilio
remonte le 8 kHz de la ligne à 16 kHz avant le transport, donc le
rééchantillonnage ci-dessous ne fait rien dans cette configuration.

Ce qui reste vrai, et pourquoi le garde reste : `transcribe()` n'a pas de
paramètre de fréquence. Le jour où `PipelineParams(audio_in_sample_rate=8000)`
serait posé pour économiser une conversion, Whisper entendrait une voix jouée à
moitié vitesse et rendrait du français plausible et faux, sans une erreur. Le
garde coûte une comparaison et ferme définitivement cette porte.

La vraie cause des transcriptions absurdes était ailleurs, dans notre code :
recharger le modèle d'avance PENDANT l'appel (bot.build_stt) affamait le
traitement temps réel de l'audio. Selon la gravité, la ligne rendait un mot
faux (« à Lyon » -> « l'avion ») ou plus rien du tout.

Restent ci-dessous deux réglages que Pipecat laisse à leur défaut. Ils
n'ont PAS été démontrés nécessaires sur nos phrases de test, qui passent aussi
sans eux : ils visent les entrées plus difficiles que le banc ne couvre pas.
À traiter comme une orientation, pas comme un correctif.
  - `initial_prompt` + `hotwords` : remontent la probabilité du vocabulaire que
    nos outils savent traiter, noms de villes en tête (voir vocabulary.py).
  - `condition_on_previous_text=False` : le service reçoit un segment par tour,
    « le texte précédent » vient d'un autre tour, et s'y conditionner est une
    source connue de boucles de répétition.
"""

import asyncio
import threading
from collections.abc import AsyncGenerator

import numpy as np
from faster_whisper import WhisperModel
from loguru import logger
from pipecat.audio.resamplers.soxr_resampler import SOXRAudioResampler
from pipecat.frames.frames import ErrorFrame, Frame, TranscriptionFrame
from pipecat.services.settings import assert_given
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transcriptions.language import Language
from pipecat.utils.time import time_now_iso8601

import config
import vocabulary

# Fréquence attendue par faster-whisper pour une entrée numpy. Non négociable :
# elle n'est pas un paramètre de transcribe(), c'est une convention. Le
# pipeline sert déjà du 16 kHz aujourd'hui — voir l'avertissement en tête.
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


# UN modèle pour tout le processus, chargé une fois.
#
# Le modèle Whisper ne dépend PAS de la langue : `WhisperModel(...)` ne la
# connaît pas, c'est `transcribe(language=...)` qui la reçoit. Il n'y a donc
# jamais de raison d'en charger un deuxième, ni de le recharger entre deux
# appels — et c'était le vrai coupable des pannes du 30/07 : chaque chargement,
# c'est quatre secondes de CPU à plein régime, qui affament le traitement temps
# réel de l'audio. Selon le moment où ça tombait, la ligne rendait un mot faux
# ou devenait complètement sourde, sans une ligne d'erreur.
#
# Un verrou sérialise les décodages : `WhisperModel.transcribe` n'est pas donné
# pour réentrant, et sur cette machine deux décodages simultanés se
# ralentiraient de toute façon l'un l'autre.
_shared_model: WhisperModel | None = None
_shared_key: tuple[str, str, str] | None = None
_shared_lock = threading.Lock()
_decode_lock = threading.Lock()


def shared_model(name: str, device: str, compute_type: str) -> WhisperModel:
    """Le modèle du processus, chargé au premier appel puis réutilisé."""
    global _shared_model, _shared_key
    key = (name, device, compute_type)
    with _shared_lock:
        if _shared_model is None or _shared_key != key:
            logger.info(f"Chargement du modèle Whisper « {name} » ({device}, {compute_type})…")
            _shared_model = WhisperModel(name, device=device, compute_type=compute_type)
            _shared_key = key
        return _shared_model


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

    def _load(self) -> None:
        """Prend le modèle partagé au lieu d'en charger un par appel.

        Appelé par le constructeur amont. Construire un service devient alors
        instantané dès le premier chargement, ce qui supprime d'un coup l'attente
        au décroché ET la famine CPU qu'un rechargement provoquait en pleine
        conversation.
        """
        self._model = shared_model(
            assert_given(self._settings.model), self._device, self._compute_type
        )

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

        def _transcribe():
            with _decode_lock:
                return self._model.transcribe(
                    audio_float,
                    language=language,
                    initial_prompt=initial_prompt_for(language),
                    # Le vocabulaire de nos outils, villes comprises
                    # (vocabulary.py). Rattrapage partiel du `keyterm` de
                    # Deepgram : même intention, effet plus faible.
                    hotwords=vocabulary.hotwords_for(str(language)),
                    condition_on_previous_text=False,
                    # Décodage glouton. Le faisceau par défaut (5) multiplie le
                    # temps de décodage, et c'est ce temps-là que l'appelant
                    # subit : rien d'autre ne sépare la fin de sa phrase du
                    # départ du LLM.
                    beam_size=config.WHISPER_BEAM_SIZE,
                )

        segments, _ = await asyncio.to_thread(_transcribe)

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
