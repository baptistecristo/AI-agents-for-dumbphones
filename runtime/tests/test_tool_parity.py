# Le runtime auto-hébergé et l'assistant Vapi doivent proposer les MÊMES
# capacités : c'est toute la promesse de l'option B (« la même chose, sans
# l'opérateur »). Les deux listes vivent dans deux langages et deux fichiers ;
# rien ne relie l'une à l'autre. Un outil ajouté côté web ne casse donc rien
# côté runtime — l'agent auto-hébergé perd juste la compétence, en silence.
#
# Ce test lit les deux listes et exige qu'elles coïncident.

import os
import re
import sys
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools import inbound_tools, outbound_tools  # noqa: E402

_WEB_TOOLS = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "agents" / "tools.ts"

# Raccrocher passe par l'outil INTÉGRÉ endCall de Vapi, déclaré dans la config
# de l'assistant (inbound.ts / outbound.ts) et non dans la liste de fonctions.
# Le runtime, lui, n'a pas d'intégré : il l'expose comme une fonction.
_BUILTIN_ON_VAPI = {"end_call"}


def _vapi_tool_names() -> set[str]:
    source = _WEB_TOOLS.read_text(encoding="utf-8")
    return set(re.findall(r'serverTool\(\s*"([a-z_]+)"', source))


class ToolParityTests(unittest.TestCase):
    def setUp(self) -> None:
        if not _WEB_TOOLS.exists():
            self.skipTest(f"{_WEB_TOOLS} absent (runtime sorti seul de son dépôt)")

    def test_the_web_file_still_parses(self) -> None:
        # Un changement de style d'écriture dans tools.ts casserait l'extraction
        # et rendrait les tests suivants vrais pour de mauvaises raisons.
        self.assertGreater(len(_vapi_tool_names()), 15)

    def test_the_self_hosted_agent_has_every_vapi_skill(self) -> None:
        missing = _vapi_tool_names() - {t.name for t in inbound_tools().standard_tools}
        self.assertEqual(
            set(),
            missing,
            f"outils présents chez Vapi, absents du runtime : {sorted(missing)}",
        )

    def test_it_does_not_promise_skills_vapi_does_not_have(self) -> None:
        extra = {t.name for t in inbound_tools().standard_tools} - _vapi_tool_names()
        self.assertEqual(
            _BUILTIN_ON_VAPI,
            extra,
            f"outils du runtime sans équivalent Vapi : {sorted(extra - _BUILTIN_ON_VAPI)}",
        )

    def test_the_outbound_mission_can_report_and_hang_up(self) -> None:
        self.assertEqual(
            {"report_outcome", "end_call"},
            {t.name for t in outbound_tools().standard_tools},
        )


if __name__ == "__main__":
    unittest.main()
