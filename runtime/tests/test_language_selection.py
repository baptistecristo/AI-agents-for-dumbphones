import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import resolve_stt_language, resolve_tts_voice


class LanguageSelectionTests(unittest.TestCase):
    def test_english_uses_english_tts_and_stt(self) -> None:
        self.assertEqual(resolve_tts_voice("en"), "en_US-lessac-medium")
        self.assertEqual(resolve_stt_language("en"), "en")

    def test_french_keeps_existing_defaults(self) -> None:
        self.assertEqual(resolve_tts_voice("fr"), "fr_FR-siwis-medium")
        self.assertEqual(resolve_stt_language("fr"), "fr")


if __name__ == "__main__":
    unittest.main()
