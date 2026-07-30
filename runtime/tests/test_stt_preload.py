# Le modèle Whisper est chargé UNE fois pour tout le processus.
#
# Ce qu'on protège ici, c'est la correction d'une panne réelle du 30/07/2026.
# Il y avait une mécanique d'« avance » qui rechargeait un modèle entre deux
# appels. Chaque chargement, ce sont quatre secondes de CPU à plein régime : sur
# un appel en cours, ça affame le traitement temps réel de l'audio. Selon le
# moment, la ligne rendait un mot faux (« à Lyon » -> « l'avion ») ou devenait
# complètement sourde, sans une ligne d'erreur nulle part.
#
# Le modèle ne dépend pas de la langue (`transcribe(language=...)` la reçoit, pas
# le constructeur), donc un seul suffit et il n'y a jamais lieu d'en recharger un.

import asyncio
import os
import sys
import time
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipecat.transcriptions.language import Language  # noqa: E402

import bot  # noqa: E402
import stt  # noqa: E402
import whisper_stt  # noqa: E402


class SharedModelTests(unittest.TestCase):
    def setUp(self) -> None:
        whisper_stt._shared_model = None
        whisper_stt._shared_key = None
        self._loads = 0

        class _FakeModel:
            pass

        def counted(name, device=None, compute_type=None):
            self._loads += 1
            time.sleep(0.05)
            return _FakeModel()

        self._original = whisper_stt.WhisperModel
        whisper_stt.WhisperModel = counted

    def tearDown(self) -> None:
        whisper_stt.WhisperModel = self._original
        whisper_stt._shared_model = None
        whisper_stt._shared_key = None

    def test_the_model_is_loaded_once_and_reused(self) -> None:
        first = whisper_stt.shared_model("small", "auto", "int8")
        second = whisper_stt.shared_model("small", "auto", "int8")

        self.assertIs(first, second)
        self.assertEqual(1, self._loads, "le modèle a été rechargé alors qu'il était déjà là")

    def test_languages_share_the_same_model(self) -> None:
        # `WhisperModel` ne connaît pas la langue : en tenir un par langue, ce
        # serait trois fois la mémoire pour trois fois le même objet.
        whisper_stt.shared_model("small", "auto", "int8")
        whisper_stt.shared_model("small", "auto", "int8")
        self.assertEqual(1, self._loads)

    def test_changing_the_model_reloads(self) -> None:
        whisper_stt.shared_model("small", "auto", "int8")
        whisper_stt.shared_model("medium", "auto", "int8")
        self.assertEqual(2, self._loads)


class PreloadTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._provider = stt.config.STT_PROVIDER
        self._key = stt.config.DEEPGRAM_API_KEY

    def tearDown(self) -> None:
        stt.config.STT_PROVIDER = self._provider
        stt.config.DEEPGRAM_API_KEY = self._key

    async def test_the_loop_keeps_running_while_the_model_loads(self) -> None:
        original = stt.build_service
        stt.build_service = lambda _language: time.sleep(0.3) or object()
        ticks = 0

        async def tick() -> None:
            nonlocal ticks
            while True:
                await asyncio.sleep(0.01)
                ticks += 1

        ticker = asyncio.create_task(tick())
        try:
            await bot.build_stt(Language.FR)
        finally:
            ticker.cancel()
            stt.build_service = original

        # Un chargement bloquant sur la boucle laisserait le compteur à 0, et
        # le websocket sans personne pour le lire.
        self.assertGreater(ticks, 5, "la boucle est restée bloquée pendant le chargement")

    async def test_deepgram_has_nothing_to_preload(self) -> None:
        stt.config.STT_PROVIDER = "deepgram"
        stt.config.DEEPGRAM_API_KEY = "dg-not-a-real-key"
        called = False
        original = stt.build_service

        def spy(_language):
            nonlocal called
            called = True
            return object()

        stt.build_service = spy
        try:
            await bot.preload_stt()
        finally:
            stt.build_service = original
        self.assertFalse(called, "un service a été construit alors qu'il n'y a rien à charger")

    async def test_preload_failure_does_not_stop_the_runtime(self) -> None:
        original = stt.build_service

        def refuse(_language):
            raise RuntimeError("pas de modèle en cache, pas de réseau")

        stt.build_service = refuse
        try:
            # Sans réseau ni cache, le runtime doit démarrer quand même.
            await bot.preload_stt()
        finally:
            stt.build_service = original


if __name__ == "__main__":
    unittest.main()
