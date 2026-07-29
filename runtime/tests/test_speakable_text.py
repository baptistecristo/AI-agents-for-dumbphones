# Le filtre TTS : ce que Piper reçoit doit être prononçable. Le cas fondateur
# est réel — l'agent a terminé un appel sur « 👋 » et la voix a dit « signe de
# la main » (espeak lit les émojis).

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from piper_http import speakable_text


class SpeakableTextTests(unittest.TestCase):
    def test_strips_emoji_but_keeps_the_sentence(self) -> None:
        self.assertEqual(speakable_text("Au revoir ! 👋"), "Au revoir !")
        self.assertEqual(speakable_text("Il fait ☀️ à Lyon."), "Il fait à Lyon.")

    def test_emoji_only_segment_becomes_empty(self) -> None:
        self.assertEqual(speakable_text("👋"), "")
        self.assertEqual(speakable_text("🎉🎉🎉"), "")

    def test_strips_markdown_decoration(self) -> None:
        self.assertEqual(speakable_text("**Important** : `demain` à 18 h"), "Important : demain à 18 h")

    def test_keeps_punctuation_accents_and_numbers(self) -> None:
        sentence = "D'accord : 113,8 dollars, c'est noté — à bientôt !"
        self.assertEqual(speakable_text(sentence), sentence)


if __name__ == "__main__":
    unittest.main()
