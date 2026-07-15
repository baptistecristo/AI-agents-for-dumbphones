# Client TTS Piper en HTTP : validation de l'URL, aller-retour, contrôle des voix.
#
# Le faux serveur imite piper-tts 1.4.2 tel qu'il est vraiment : synthèse sur
# `POST /` (et non `/synthesize`, qui n'existe que sur master), réponse WAV
# annoncée en text/html, et surtout repli silencieux sur la voix par défaut quand
# la voix demandée manque. Copier ces défauts est le but : un faux serveur idéal
# ne validerait que nos suppositions.

import io
import os
import sys
import unittest
import wave
from pathlib import Path

from aiohttp import web

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipecat.frames.frames import ErrorFrame, TTSAudioRawFrame, TTSSpeakFrame  # noqa: E402
from pipecat.pipeline.worker import PipelineParams  # noqa: E402
from pipecat.tests.utils import run_test  # noqa: E402

from config import check_piper_base_url  # noqa: E402
from piper_http import PiperHttpTTSService, PiperVoiceMissing, check_voices_available  # noqa: E402

PIPER_RATE = 22050  # fr_FR-siwis-medium synthétise à 22,05 kHz
OUT_RATE = 16000  # le téléphone tourne à 8 ou 16 kHz : il y a donc rééchantillonnage


def _wav_bytes(rate: int = PIPER_RATE, samples: int = 4410) -> bytes:
    """Un WAV mono 16 bits, comme celui que renvoie le serveur Piper."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"\x01\x02" * samples)
    return buffer.getvalue()


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


class FakePiperMixin:
    """Un faux serveur Piper, fidèle aux bizarreries de la 1.4.2."""

    served_voices = ("fr_FR-siwis-medium", "en_US-lessac-medium")

    async def asyncSetUp(self) -> None:
        self.requests: list[dict] = []

        async def synthesize(request: web.Request) -> web.Response:
            payload = await request.json()
            self.requests.append(payload)
            # Repli silencieux de la 1.4.2 : voix inconnue -> voix par défaut, 200.
            # Reproduit tel quel, c'est ce que check_voices_available doit prévenir.
            return web.Response(body=_wav_bytes(), content_type="text/html")

        async def voices(_request: web.Request) -> web.Response:
            # /voices rend un objet {identifiant: config}, sans suffixe .onnx.
            return web.json_response({v: {"sample_rate": PIPER_RATE} for v in self.served_voices})

        app = web.Application()
        app.router.add_post("/", synthesize)
        app.router.add_get("/voices", voices)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.base_url = f"http://127.0.0.1:{self.runner.addresses[0][1]}"

    async def asyncTearDown(self) -> None:
        await self.runner.cleanup()


class PiperHttpRoundTripTests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):

    async def _speak(self, base_url: str) -> tuple[list, list]:
        """Fait dire "bonjour" au service dans un vrai pipeline.

        Passer par run_test() plutôt que d'appeler run_tts() directement : le
        service ne connaît sa fréquence de sortie qu'après la StartFrame, et
        chunk_size en dépend. Sans pipeline, chunk_size vaut 0 et iter_chunked(0)
        ne rend jamais rien — le service paraît muet alors qu'il va très bien.

        Rend (trames descendantes, trames montantes) : Pipecat renvoie l'audio
        vers l'aval et les erreurs vers l'amont.
        """
        service = PiperHttpTTSService(
            base_url=base_url,
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

    async def test_posts_text_and_voice_as_piper_expects(self) -> None:
        await self._speak(self.base_url)
        self.assertEqual(self.requests, [{"text": "bonjour", "voice": "fr_FR-siwis-medium"}])

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


class VoiceAvailabilityTests(FakePiperMixin, unittest.IsolatedAsyncioTestCase):
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


if __name__ == "__main__":
    unittest.main()
