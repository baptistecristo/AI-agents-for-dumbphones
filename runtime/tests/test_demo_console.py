# La console démo (/demo) distribue un jeton de flux valide : ces tests
# vérifient qu'elle est fermée par défaut, bornée par DEMO_CALLERS quand elle
# est ouverte, et que le jeton remis ouvre bien /ws (même calcul que le TwiML).

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import config
import server
import twilio_media


class DemoConsoleTests(unittest.TestCase):
    def setUp(self) -> None:
        # TestClient hors gestionnaire de contexte : le lifespan (contrôle du
        # serveur Piper) ne tourne pas, ce qui est voulu — pas de Piper en CI.
        self.client = TestClient(server.app)
        self._console = config.DEMO_CONSOLE
        self._callers = config.DEMO_CALLERS
        self._max_seconds = config.MAX_CALL_SECONDS

    def tearDown(self) -> None:
        config.DEMO_CONSOLE = self._console
        config.DEMO_CALLERS = self._callers
        config.MAX_CALL_SECONDS = self._max_seconds

    def test_disabled_by_default(self) -> None:
        config.DEMO_CONSOLE = False
        self.assertEqual(self.client.get("/demo").status_code, 404)
        self.assertEqual(self.client.get("/demo/token").status_code, 404)

    def test_page_served_when_enabled(self) -> None:
        config.DEMO_CONSOLE = True
        response = self.client.get("/demo")
        self.assertEqual(response.status_code, 200)
        self.assertIn("/demo/token", response.text)  # la page va chercher son jeton

    def test_anonymous_token_opens_ws_like_a_twiml_would(self) -> None:
        config.DEMO_CONSOLE = True
        params = self.client.get("/demo/token").json()["params"]
        tok = params.pop("tok")
        self.assertEqual(params, {"direction": "inbound", "caller": ""})
        self.assertEqual(tok, server._stream_token(params))
        # Et le faux opérateur en Python signe pareil : trois implémentations,
        # un seul calcul.
        self.assertEqual(
            twilio_media.signed_parameters(config.RUNTIME_API_SECRET)["tok"], tok
        )

    def test_token_reply_separates_signed_params_from_metadata(self) -> None:
        # La page envoie `params` TELS QUELS en customParameters : tout champ
        # non signé qui s'y glisserait invaliderait le jeton à l'ouverture du
        # flux. max_seconds vit donc À CÔTÉ, jamais dedans.
        config.DEMO_CONSOLE = True
        config.MAX_CALL_SECONDS = 120
        payload = self.client.get("/demo/token").json()
        self.assertEqual(payload["max_seconds"], 120)
        self.assertEqual(set(payload["params"]), {"direction", "caller", "tok"})

    def test_caller_outside_allow_list_is_refused(self) -> None:
        config.DEMO_CONSOLE = True
        config.DEMO_CALLERS = ["+33612345678"]
        refused = self.client.get("/demo/token", params={"caller": "+33700000000"})
        self.assertEqual(refused.status_code, 403)

    def test_caller_on_allow_list_gets_a_signed_token(self) -> None:
        config.DEMO_CONSOLE = True
        config.DEMO_CALLERS = ["+33612345678"]
        params = self.client.get("/demo/token", params={"caller": "+33612345678"}).json()["params"]
        self.assertEqual(params["caller"], "+33612345678")
        self.assertEqual(
            params["tok"],
            server._stream_token({"direction": "inbound", "caller": "+33612345678"}),
        )


if __name__ == "__main__":
    unittest.main()
