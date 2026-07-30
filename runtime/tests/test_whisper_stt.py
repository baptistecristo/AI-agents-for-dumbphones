# La ligne téléphonique est en 8 kHz, faster-whisper attend du 16 kHz, et
# `transcribe()` n'a pas de paramètre de fréquence : un tableau numpy est
# TOUJOURS lu comme du 16 kHz.
#
# Pipecat 1.5.0 passe le tampon tel quel. Whisper entendait donc une voix jouée
# à moitié vitesse et décodait du français plausible mais faux, sans jamais
# signaler d'erreur :
#
#   « Quel temps fait-il à Lyon aujourd'hui ? »
#     8 kHz brut      -> « C'est bon fait, il est là aujourd'hui. »
#     rééchantillonné -> « Quel temps fait-il à Lyon aujourd'hui ? »
#
# Rien dans une transcription ne dit qu'elle a été décodée à la mauvaise
# fréquence. Ce test vérifie donc le seul fait observable : ce qui part chez
# faster-whisper a bien été ramené à 16 kHz.

import asyncio
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipecat.transcriptions.language import Language  # noqa: E402

from whisper_stt import WHISPER_SAMPLE_RATE, PhoneWhisperSTTService, initial_prompt_for  # noqa: E402

_PHONE_RATE = 8000
_SECONDS = 1


class _FakeModel:
    """Retient ce qu'on lui donne, et ne transcrit rien."""

    def __init__(self) -> None:
        self.samples: int | None = None
        self.kwargs: dict = {}

    def transcribe(self, audio, **kwargs):
        self.samples = len(audio)
        self.kwargs = kwargs
        return [], None


def _service(sample_rate: int) -> tuple[PhoneWhisperSTTService, _FakeModel]:
    service = PhoneWhisperSTTService(
        settings=PhoneWhisperSTTService.Settings(model="tiny", language=Language.FR),
    )
    model = _FakeModel()
    service._model = model
    service._sample_rate = sample_rate
    return service, model


async def _run(service: PhoneWhisperSTTService, audio: bytes) -> None:
    async for _ in service.run_stt(audio):
        pass


class PhoneWhisperTests(unittest.TestCase):
    def test_phone_audio_is_resampled_to_what_whisper_expects(self) -> None:
        service, model = _service(_PHONE_RATE)
        asyncio.run(_run(service, b"\x00\x00" * (_PHONE_RATE * _SECONDS)))

        # Une seconde de parole doit rester une seconde de parole. Sans
        # rééchantillonnage, Whisper lit ces 8000 échantillons comme une
        # demi-seconde et décode une voix ralentie d'une octave.
        self.assertEqual(WHISPER_SAMPLE_RATE * _SECONDS, model.samples)

    def test_audio_already_at_the_right_rate_is_left_alone(self) -> None:
        service, model = _service(WHISPER_SAMPLE_RATE)
        asyncio.run(_run(service, b"\x00\x00" * (WHISPER_SAMPLE_RATE * _SECONDS)))

        self.assertEqual(WHISPER_SAMPLE_RATE * _SECONDS, model.samples)

    def test_decoding_is_steered_in_the_language_of_the_call(self) -> None:
        service, model = _service(_PHONE_RATE)
        asyncio.run(_run(service, b"\x00\x00" * _PHONE_RATE))

        self.assertEqual(initial_prompt_for(Language.FR), model.kwargs.get("initial_prompt"))
        # Le service reçoit un segment par tour : « le texte précédent »
        # appartient à un autre tour, et s'y conditionner fait boucler.
        self.assertIs(False, model.kwargs.get("condition_on_previous_text"))


class InitialPromptTests(unittest.TestCase):
    def test_every_supported_language_has_its_own(self) -> None:
        prompts = {str(lang): initial_prompt_for(lang) for lang in (Language.FR, Language.EN, Language.ES)}
        self.assertEqual(3, len(set(prompts.values())), "deux langues partagent la même amorce")

    def test_an_unsupported_language_falls_back_to_french(self) -> None:
        self.assertEqual(initial_prompt_for(Language.DE), initial_prompt_for(Language.FR))


if __name__ == "__main__":
    unittest.main()
