# Choix du fournisseur STT (STT_PROVIDER), et surtout : ce qui arrive quand on
# demande Deepgram sans clé. Un appel doit se passer, même mal configuré.

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipecat.transcriptions.language import Language  # noqa: E402

import config  # noqa: E402
import stt  # noqa: E402


class ProviderChoiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._provider = config.STT_PROVIDER
        self._key = config.DEEPGRAM_API_KEY

    def tearDown(self) -> None:
        config.STT_PROVIDER = self._provider
        config.DEEPGRAM_API_KEY = self._key

    def test_whisper_is_the_default(self) -> None:
        config.STT_PROVIDER = "whisper"
        config.DEEPGRAM_API_KEY = ""
        self.assertEqual(stt.WHISPER, stt.provider())
        self.assertTrue(stt.loads_a_model())

    def test_deepgram_is_used_when_a_key_is_there(self) -> None:
        config.STT_PROVIDER = "deepgram"
        config.DEEPGRAM_API_KEY = "dg-not-a-real-key"
        self.assertEqual(stt.DEEPGRAM, stt.provider())

    # Le piège : STT_PROVIDER=deepgram sans la clé. Laisser partir l'appel vers
    # un service qui ne peut pas s'authentifier, c'est un agent muet ; on
    # retombe sur Whisper en le disant.
    def test_deepgram_without_a_key_falls_back_instead_of_failing(self) -> None:
        config.STT_PROVIDER = "deepgram"
        config.DEEPGRAM_API_KEY = ""
        self.assertEqual(stt.WHISPER, stt.provider())
        self.assertTrue(stt.loads_a_model())

    def test_an_unknown_provider_falls_back_to_whisper(self) -> None:
        config.STT_PROVIDER = "sphinx"
        self.assertEqual(stt.WHISPER, stt.provider())

    # Deepgram est un websocket vers leur API : rien à charger, donc l'avance
    # tenue par bot.py n'a pas d'objet et ne doit pas se déclencher.
    def test_deepgram_has_no_model_to_preload(self) -> None:
        config.STT_PROVIDER = "deepgram"
        config.DEEPGRAM_API_KEY = "dg-not-a-real-key"
        self.assertFalse(stt.loads_a_model())


class LanguageTests(unittest.TestCase):
    def test_the_three_supported_languages_map_to_themselves(self) -> None:
        self.assertEqual(Language.EN, stt.stt_language_for("en"))
        self.assertEqual(Language.ES, stt.stt_language_for("es"))
        self.assertEqual(Language.FR, stt.stt_language_for("fr"))

    def test_anything_else_falls_back_to_french(self) -> None:
        for unknown in ("de", "", "FR", "fr-FR"):
            self.assertEqual(Language.FR, stt.stt_language_for(unknown))


if __name__ == "__main__":
    unittest.main()
