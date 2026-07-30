# Chargement du modèle Whisper : hors boucle asyncio, sérialisé, jamais fatal.
#
# Le bug corrigé ici : WhisperSTTService charge ses poids dans __init__, en
# bloquant. Construit depuis la boucle, il figeait le processus entier pendant
# plusieurs secondes — le websocket n'était plus lu, et les premiers mots de
# l'appelant étaient perdus au lieu d'être mis en file. Ces tests vérifient la
# propriété qui compte : pendant le chargement, la boucle continue de tourner.

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

_LOAD_SECONDS = 0.3


class SttLoadTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._original_build = bot._build_stt

    def tearDown(self) -> None:
        bot._build_stt = self._original_build

    async def test_the_loop_keeps_running_while_the_model_loads(self) -> None:
        bot._build_stt = lambda _language: time.sleep(_LOAD_SECONDS) or object()

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

        # Chargement bloquant sur la boucle : le compteur resterait à 0.
        self.assertGreater(
            ticks, 5, "la boucle asyncio est restée bloquée pendant le chargement du modèle"
        )

    async def test_two_calls_do_not_load_two_models_at_once(self) -> None:
        live = 0
        peak = 0

        def counted_load(_language: Language) -> object:
            nonlocal live, peak
            live += 1
            peak = max(peak, live)
            time.sleep(0.1)
            live -= 1
            return object()

        bot._build_stt = counted_load
        await asyncio.gather(bot.build_stt(Language.FR), bot.build_stt(Language.EN))

        # Deux modèles `medium` chargés en parallèle, ce sont 3 Go de RSS.
        self.assertEqual(peak, 1, "deux chargements de modèle se sont chevauchés")

    async def test_preload_failure_does_not_stop_the_runtime(self) -> None:
        def refuse(_language: Language) -> object:
            raise RuntimeError("pas de modèle en cache, pas de réseau")

        bot._build_stt = refuse
        # Sans réseau ni cache, le runtime doit démarrer quand même : l'appel
        # paiera le chargement, comme avant le préchargement.
        await bot.preload_stt()


if __name__ == "__main__":
    unittest.main()
