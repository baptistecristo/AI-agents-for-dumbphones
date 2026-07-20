# Client TTS Piper en HTTP : validation de l'URL, aller-retour, contrôle des
# voix, résolution de la route de synthèse.
#
# Deux faux serveurs, parce que la route a bougé entre deux versions
# installables de piper-tts :
#
#   1.5.0 et plus : POST /synthesize, et `/` n'accepte plus que GET.
#   1.3 à 1.4.2   : POST /, pas de /synthesize du tout.
#
# Les deux imitent piper-tts tel qu'il est vraiment : réponse WAV annoncée en
# text/html, et surtout repli silencieux sur la voix par défaut quand la voix
# demandée manque. Copier ces défauts est le but : un faux serveur idéal ne
# validerait que nos suppositions.
#
# Les handlers OPTIONS explicites reproduisent Flask, sur lequel tourne le vrai
# serveur : Flask ajoute OPTIONS d'office et répond 200 avec l'en-tête `Allow`,
# là où aiohttp répondrait 405 avec le même en-tête. Le client accepte les deux
# (voir _route_accepts_post), mais le faux serveur suit l'original.

import io
import os
import sys
import unittest
import wave
from pathlib import Path

import aiohttp
from aiohttp import web

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipecat.frames.frames import ErrorFrame, TTSAudioRawFrame, TTSSpeakFrame  # noqa: E402
from pipecat.pipeline.worker import PipelineParams  # noqa: E402
from pipecat.tests.utils import run_test  # noqa: E402

from config import check_piper_base_url, check_piper_synthesize_path  # noqa: E402
from piper_http import (  # noqa: E402
    SYNTHESIZE_PATH_AUTO,
    SYNTHESIZE_PATH_CURRENT,
    SYNTHESIZE_PATH_LEGACY,
    PiperEndpointNotFound,
    PiperHttpTTSService,
    PiperRouteMismatch,
    PiperVoiceMissing,
    check_piper_server,
    check_voices_available,
    detect_synthesize_path,
    verify_synthesize_path,
)

PIPER_RATE = 22050  # fr_FR-siwis-medium synthétise à 22,05 kHz
OUT_RATE = 16000  # le téléphone tourne à 8 ou 16 kHz : il y a donc rééchantillonnage

SERVED_VOICES = ("fr_FR-siwis-medium", "en_US-lessac-medium")


def _wav_bytes(rate: int = PIPER_RATE, samples: int = 4410) -> bytes:
    """Un WAV mono 16 bits, comme celui que renvoie le serveur Piper."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"\x01\x02" * samples)
    return buffer.getvalue()


def _options(*methods: str):
    """Handler OPTIONS à la Flask : 200 et l'en-tête `Allow`."""

    async def handler(_request: web.Request) -> web.Response:
        return web.Response(status=200, headers={"Allow": ", ".join(methods)})

    return handler


class FakePiperMixin:
    """Faux serveur Piper. `piper_version` choisit la forme des routes."""

    piper_version = "1.5.0"
    served_voices = SERVED_VOICES

    async def asyncSetUp(self) -> None:
        self.requests: list[dict] = []

        async def synthesize(request: web.Request) -> web.Response:
            payload = await request.json()
            self.requests.append(payload)
            # Repli silencieux du vrai serveur : voix inconnue -> voix par
            # défaut, 200. Reproduit tel quel, c'est ce que
            # check_voices_available doit prévenir.
            return web.Response(body=_wav_bytes(), content_type="text/html")

        async def index(_request: web.Request) -> web.Response:
            # 1.5.0 sert une page de test sur `/`. Elle n'existait pas avant.
            return web.Response(text="<html>piper</html>", content_type="text/html")

        async def voices(_request: web.Request) -> web.Response:
            # /voices rend un objet {identifiant: config}, sans suffixe .onnx.
            # Identique dans les deux versions : c'est bien pour ça qu'il ne
            # suffit pas à détecter une route de synthèse fausse.
            return web.json_response({v: {"sample_rate": PIPER_RATE} for v in self.served_voices})

        app = web.Application()
        app.router.add_get("/voices", voices)
        app.router.add_route("OPTIONS", "/voices", _options("GET", "HEAD", "OPTIONS"))

        if self.piper_version == "1.5.0":
            app.router.add_post("/synthesize", synthesize)
            app.router.add_route("OPTIONS", "/synthesize", _options("POST", "OPTIONS"))
            app.router.add_get("/", index)
            app.router.add_route("OPTIONS", "/", _options("GET", "HEAD", "OPTIONS"))
        elif self.piper_version == "1.4.2":
            app.router.add_post("/", synthesize)
            app.router.add_route("OPTIONS", "/", _options("POST", "OPTIONS"))
        elif self.piper_version == "aucune":
            # Un serveur qui répond mais ne synthétise nulle part : mauvaise
            # URL, ou tout autre service qui sert par hasard un /voices.
            pass
        else:  # pragma: no cover
            raise AssertionError(f"version de faux serveur inconnue : {self.piper_version}")

        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.base_url = f"http://127.0.0.1:{self.runner.addresses[0][1]}"

    async def asyncTearDown(self) -> None:
        await self.runner.cleanup()


# ------------------------------------------------------- validation des réglages
class BaseUrlValidationTests(unittest.TestCase):
    def test_server_root_is_accepted(self) -> None:
        url = "http://localhost:5000"
        self.assertEqual(check_piper_base_url(url), url)

    def test_trailing_slash_is_trimmed(self) -> None:
        # /voices est concaténé derrière : une barre finale donnerait //voices.
        self.assertEqual(check_piper_base_url("http://localhost:5000/"), "http://localhost:5000")

    def test_non_http_url_is_rejected(self) -> None:
        for url in ("localhost:5000", "ftp://host", ""):
            with self.subTest(url=url), self.assertRaises(RuntimeError):
                check_piper_base_url(url)

    def test_synthesis_route_as_base_url_is_rejected(self) -> None:
        # La confusion que la docstring du constructeur induisait avant : coller
        # la route de synthèse dans PIPER_BASE_URL casse AUSSI /voices, donc le
        # contrôle de démarrage, donc le diagnostic.
        for url in ("http://localhost:5000/synthesize", "http://localhost:5000/synthesize/"):
            with self.subTest(url=url), self.assertRaises(RuntimeError) as caught:
                check_piper_base_url(url)
            self.assertIn("RACINE", str(caught.exception))


class SynthesizePathValidationTests(unittest.TestCase):
    def test_auto_is_the_default_and_survives_normalisation(self) -> None:
        self.assertEqual(check_piper_synthesize_path("auto"), SYNTHESIZE_PATH_AUTO)
        self.assertEqual(check_piper_synthesize_path("  AUTO "), SYNTHESIZE_PATH_AUTO)

    def test_explicit_routes_are_accepted(self) -> None:
        self.assertEqual(check_piper_synthesize_path("/synthesize"), SYNTHESIZE_PATH_CURRENT)
        self.assertEqual(check_piper_synthesize_path("/"), SYNTHESIZE_PATH_LEGACY)

    def test_route_without_leading_slash_is_rejected(self) -> None:
        # "synthesize" collé derrière la racine donnerait `http://hôte:5000synthesize`.
        with self.assertRaises(RuntimeError):
            check_piper_synthesize_path("synthesize")


# ------------------------------------------------------- résolution de la route
class RouteDetectionOn150Tests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):
    piper_version = "1.5.0"

    async def test_detects_the_synthesize_route(self) -> None:
        async with aiohttp.ClientSession() as session:
            self.assertEqual(
                await detect_synthesize_path(self.base_url, session), SYNTHESIZE_PATH_CURRENT
            )

    async def test_posting_to_root_is_refused_by_150(self) -> None:
        # LE défaut que ce lot corrige : viser `/` en dur donne 405 sur 1.5.0.
        # Si ce test passe au vert avec un 200, le faux serveur a régressé vers
        # la 1.4.2 et ne prouve plus rien.
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.base_url}/", json={"text": "x"}) as response:
                self.assertEqual(response.status, 405)

    async def test_pinning_the_legacy_route_is_refused_at_startup(self) -> None:
        # Route épinglée à la main sur la mauvaise valeur : doit tomber au
        # démarrage, pas en plein appel.
        with self.assertRaises(PiperRouteMismatch) as caught:
            await check_piper_server(self.base_url, list(SERVED_VOICES), SYNTHESIZE_PATH_LEGACY)
        self.assertIn(SYNTHESIZE_PATH_CURRENT, str(caught.exception))

    async def test_startup_check_returns_the_detected_route(self) -> None:
        resolved = await check_piper_server(
            self.base_url, list(SERVED_VOICES), SYNTHESIZE_PATH_AUTO
        )
        self.assertEqual(resolved, SYNTHESIZE_PATH_CURRENT)


class RouteDetectionOn142Tests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):
    piper_version = "1.4.2"

    async def test_detects_the_root_route(self) -> None:
        # 1.4.2 n'a pas de /synthesize : la sonde doit retomber sur `/`, sinon
        # tous les déploiements existants cassent.
        async with aiohttp.ClientSession() as session:
            self.assertEqual(
                await detect_synthesize_path(self.base_url, session), SYNTHESIZE_PATH_LEGACY
            )

    async def test_pinning_the_current_route_is_refused_at_startup(self) -> None:
        with self.assertRaises(PiperRouteMismatch):
            await check_piper_server(self.base_url, list(SERVED_VOICES), SYNTHESIZE_PATH_CURRENT)

    async def test_pinned_root_route_is_accepted(self) -> None:
        async with aiohttp.ClientSession() as session:
            await verify_synthesize_path(self.base_url, SYNTHESIZE_PATH_LEGACY, session)


class RouteDetectionWithoutAnyRouteTests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):
    piper_version = "aucune"

    async def test_detection_fails_loudly(self) -> None:
        # Le serveur répond (donc il tourne) mais ne synthétise nulle part :
        # c'est une erreur de configuration, pas une panne réseau, et server.py
        # doit refuser de démarrer dessus.
        async with aiohttp.ClientSession() as session:
            with self.assertRaises(PiperRouteMismatch):
                await detect_synthesize_path(self.base_url, session)


# ------------------------------------------------------- aller-retour audio
class PiperHttpRoundTripTests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):
    piper_version = "1.5.0"

    async def _speak(self, base_url: str, synthesize_path: str = SYNTHESIZE_PATH_CURRENT):
        """Fait dire "bonjour" au service dans un vrai pipeline.

        Passer par run_test() plutôt que d'appeler run_tts() directement : le
        service ne connaît sa fréquence de sortie qu'après la StartFrame, et
        chunk_size en dépend. Sans pipeline, chunk_size vaut 0 et iter_chunked(0)
        ne rend jamais rien : le service paraît muet alors qu'il va très bien.

        Rend (trames descendantes, trames montantes) : Pipecat renvoie l'audio
        vers l'aval et les erreurs vers l'amont.
        """
        service = PiperHttpTTSService(
            base_url=base_url,
            synthesize_path=synthesize_path,
            settings=PiperHttpTTSService.Settings(voice="fr_FR-siwis-medium"),
        )
        try:
            received_down, received_up = await run_test(
                service,
                frames_to_send=[TTSSpeakFrame("bonjour")],
                expected_down_frames=None,
                pipeline_params=PipelineParams(audio_out_sample_rate=OUT_RATE),
            )
        finally:
            await service.cleanup()
        return list(received_down), list(received_up)

    async def test_default_route_reaches_a_150_server(self) -> None:
        # Sans argument de route, le service doit viser la version courante.
        await self._speak(self.base_url)
        self.assertEqual(self.requests, [{"text": "bonjour", "voice": "fr_FR-siwis-medium"}])

    async def test_auto_is_never_concatenated_as_a_route(self) -> None:
        # Un service instancié hors du démarrage de server.py peut recevoir
        # "auto" tel quel : il doit le lire comme une consigne, pas comme une
        # route, sinon l'URL devient `http://hôte:5000auto`.
        service = PiperHttpTTSService(
            base_url=self.base_url,
            synthesize_path=SYNTHESIZE_PATH_AUTO,
            settings=PiperHttpTTSService.Settings(voice="fr_FR-siwis-medium"),
        )
        try:
            self.assertEqual(service.synthesize_url, f"{self.base_url}{SYNTHESIZE_PATH_CURRENT}")
        finally:
            await service.cleanup()

    async def test_wav_becomes_pcm_frames_at_the_pipeline_rate(self) -> None:
        down, _ = await self._speak(self.base_url)

        audio = [f for f in down if isinstance(f, TTSAudioRawFrame)]
        self.assertTrue(audio, "aucune trame audio produite")
        # Piper synthétise à 22,05 kHz, le pipeline sort à 16 kHz : la fréquence
        # vient de la StartFrame, pas du WAV, sinon l'appelant entend un chipmunk.
        self.assertTrue(all(f.sample_rate == OUT_RATE for f in audio))
        # L'en-tête RIFF doit être retiré, sans quoi il s'entend comme un claquement.
        joined = b"".join(f.audio for f in audio)
        self.assertNotIn(b"RIFF", joined)
        self.assertGreater(len(joined), 0)

    async def test_server_error_surfaces_instead_of_hanging(self) -> None:
        # Piper injoignable ou mal configuré : l'appel ne doit pas rester muet
        # sans trace. Pipecat pousse les ErrorFrame vers l'amont.
        _, up = await self._speak(f"{self.base_url}/nowhere")

        errors = [f for f in up if isinstance(f, ErrorFrame)]
        self.assertTrue(errors, "une réponse non-200 doit produire une ErrorFrame")
        # Le message doit nommer l'URL : c'est la panne la plus probable au
        # déploiement.
        self.assertIn("/nowhere", errors[0].error)

    async def test_wrong_route_names_the_version_change(self) -> None:
        # Contrôle de démarrage sauté (Piper lancé après le runtime) : le
        # message d'erreur doit quand même mettre sur la piste.
        _, up = await self._speak(self.base_url, synthesize_path=SYNTHESIZE_PATH_LEGACY)

        errors = [f for f in up if isinstance(f, ErrorFrame)]
        self.assertTrue(errors, "un 405 doit produire une ErrorFrame")
        self.assertIn("PIPER_SYNTHESIZE_PATH", errors[0].error)


class LegacyRoundTripTests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):
    piper_version = "1.4.2"

    async def test_legacy_route_still_synthesises(self) -> None:
        # 1.4.2 a été la seule version installable pendant des mois : le repli
        # doit rester un vrai chemin qui parle, pas seulement une détection.
        service = PiperHttpTTSService(
            base_url=self.base_url,
            synthesize_path=SYNTHESIZE_PATH_LEGACY,
            settings=PiperHttpTTSService.Settings(voice="fr_FR-siwis-medium"),
        )
        try:
            down, _ = await run_test(
                service,
                frames_to_send=[TTSSpeakFrame("bonjour")],
                expected_down_frames=None,
                pipeline_params=PipelineParams(audio_out_sample_rate=OUT_RATE),
            )
        finally:
            await service.cleanup()

        self.assertEqual(self.requests, [{"text": "bonjour", "voice": "fr_FR-siwis-medium"}])
        self.assertTrue([f for f in down if isinstance(f, TTSAudioRawFrame)])


# ------------------------------------------------------- contrôle des voix
class VoiceAvailabilityTests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):
    piper_version = "1.5.0"

    async def test_passes_when_every_voice_is_served(self) -> None:
        await check_voices_available(self.base_url, list(self.served_voices))

    async def test_raises_on_a_missing_voice(self) -> None:
        # Le cas qui, sans ce contrôle, ne se voit pas : Piper répondrait 200
        # dans sa voix par défaut et l'anglais sortirait avec la voix française.
        with self.assertRaises(PiperVoiceMissing) as caught:
            await check_voices_available(self.base_url, ["de_DE-thorsten-medium"])

        message = str(caught.exception)
        self.assertIn("de_DE-thorsten-medium", message)
        self.assertIn("fr_FR-siwis-medium", message)  # les voix servies sont listées

    async def test_unreachable_server_raises_rather_than_passing(self) -> None:
        # Injoignable n'est pas « voix absente » : server.py distingue les deux,
        # donc l'erreur réseau doit remonter telle quelle.
        with self.assertRaises(Exception) as caught:
            await check_voices_available("http://127.0.0.1:1", ["fr_FR-siwis-medium"])
        self.assertNotIsInstance(caught.exception, PiperVoiceMissing)

    async def test_base_url_pointing_at_a_route_is_a_configuration_error(self) -> None:
        # PIPER_BASE_URL avec la route de synthèse dedans : GET
        # /synthesize/voices rend 404. C'est une erreur de configuration, pas
        # une panne réseau, et server.py doit refuser de démarrer.
        with self.assertRaises(PiperEndpointNotFound) as caught:
            await check_voices_available(f"{self.base_url}/synthesize", ["fr_FR-siwis-medium"])
        self.assertIn("RACINE", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
