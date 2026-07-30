# Chargement du modèle Whisper : hors boucle asyncio, sérialisé, en avance,
# jamais fatal.
#
# Le bug corrigé ici : WhisperSTTService charge ses poids dans __init__, en
# bloquant, et ces ~4 s tombaient entre l'accueil et le démarrage du pipeline.
# L'appelant répondait pendant ce trou : sa première phrase arrivait avant que
# le transport n'écoute, et se perdait sans laisser de trace dans les logs.

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
        bot._stt_spare = None

    def tearDown(self) -> None:
        bot._build_stt = self._original_build
        bot._stt_spare = None

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

    async def test_a_call_gets_the_spare_without_waiting(self) -> None:
        loads = 0

        def slow_load(_language: Language) -> object:
            nonlocal loads
            loads += 1
            time.sleep(_LOAD_SECONDS)
            return object()

        bot._build_stt = slow_load
        await bot.preload_stt()
        self.assertEqual(1, loads, "le préchargement n'a pas chargé le modèle")

        # C'est tout l'objet de l'avance : l'appel ne doit rien attendre, sinon
        # le trou se rouvre entre l'accueil et le démarrage du pipeline.
        started = time.monotonic()
        service = await bot.build_stt(Language.FR)
        self.assertLess(time.monotonic() - started, _LOAD_SECONDS)
        self.assertIsNotNone(service)

    async def test_the_spare_is_never_handed_to_two_calls(self) -> None:
        bot._build_stt = lambda _language: time.sleep(0.05) or object()
        await bot.preload_stt()

        first = await bot.build_stt(Language.FR)
        await bot.stock_stt_spare(Language.FR)  # ce que fait la fin d'appel
        second = await bot.build_stt(Language.FR)

        # Un service Pipecat est attaché à son pipeline : le même objet dans
        # deux appels, ce sont deux pipelines qui se marchent dessus.
        self.assertIsNot(first, second)

    # Charger un modèle, c'est plusieurs secondes de CPU à plein régime. Le
    # faire pendant l'appel qui vient de décrocher affamait le traitement
    # temps réel : l'agent devenait sourd par intermittence, sans une ligne
    # dans les logs puisque le VAD ne voyait plus passer les trames.
    async def test_taking_the_spare_does_not_reload_during_the_call(self) -> None:
        loads = 0

        def counted_load(_language: Language) -> object:
            nonlocal loads
            loads += 1
            return object()

        bot._build_stt = counted_load
        await bot.preload_stt()
        self.assertEqual(1, loads)

        await bot.build_stt(Language.FR)
        await asyncio.sleep(0.1)  # laisse tourner une éventuelle tâche de fond
        self.assertEqual(1, loads, "un modèle a été chargé pendant l'appel")
        self.assertIsNone(bot._stt_spare)

    async def test_the_spare_follows_the_language_and_stays_alone(self) -> None:
        bot._build_stt = lambda _language: time.sleep(0.05) or object()
        await bot.preload_stt()
        self.assertEqual(str(Language.FR), bot._stt_spare[0])

        # Appel en espagnol : l'avance française ne lui sert à rien, il charge
        # la sienne, et la fin d'appel remet l'avance dans SA langue.
        await bot.build_stt(Language.ES)
        await bot.stock_stt_spare(Language.ES)

        # Une seule avance à la fois : trois modèles `medium` en réserve, ce
        # sont 4,5 Go sur la machine d'un particulier.
        self.assertEqual(str(Language.ES), bot._stt_spare[0])

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
        # paiera le chargement, comme avant l'avance.
        await bot.preload_stt()
        self.assertIsNone(bot._stt_spare)


if __name__ == "__main__":
    unittest.main()
