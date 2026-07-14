# Sélection de la voix Piper selon la langue de session.
# Test initialement proposé par @tarun2684 (PR #7), adapté à piper_voice_for().

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import PIPER_VOICE_EN, PIPER_VOICE_FR, piper_voice_for


class LanguageSelectionTests(unittest.TestCase):
    def test_english_uses_english_voice(self) -> None:
        self.assertEqual(piper_voice_for("en"), PIPER_VOICE_EN)

    def test_french_keeps_default_voice(self) -> None:
        self.assertEqual(piper_voice_for("fr"), PIPER_VOICE_FR)

    def test_unknown_language_falls_back_to_french(self) -> None:
        self.assertEqual(piper_voice_for("es"), PIPER_VOICE_FR)
        self.assertEqual(piper_voice_for(""), PIPER_VOICE_FR)


if __name__ == "__main__":
    unittest.main()
