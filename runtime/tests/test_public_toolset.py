# L'appelant sans compte ne doit voir QUE les outils publics : la liste
# PUBLIC_TOOLS est le pendant du prompt compact côté web (inbound.ts), et ces
# tests l'empêchent de dériver — un outil personnel qui s'y glisserait serait
# proposé à des inconnus, un outil public qui en sortirait rendrait l'agent
# muet sur ce qu'il sait faire.

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import tools


class PublicToolsetTests(unittest.TestCase):
    def test_anonymous_schema_is_exactly_the_public_set(self) -> None:
        lean = {t.name for t in tools.inbound_tools(known_caller=False).standard_tools}
        self.assertEqual(lean, set(tools.PUBLIC_TOOLS))

    def test_public_set_is_a_subset_of_the_full_schema(self) -> None:
        full = {t.name for t in tools.inbound_tools(known_caller=True).standard_tools}
        self.assertTrue(set(tools.PUBLIC_TOOLS).issubset(full))

    def test_no_personal_tool_leaks_to_anonymous_callers(self) -> None:
        lean = {t.name for t in tools.inbound_tools(known_caller=False).standard_tools}
        for personal in ("list_events", "send_sms", "place_call", "recall", "request_code"):
            self.assertNotIn(personal, lean)

    def test_default_stays_the_full_schema(self) -> None:
        # bot.py appelle inbound_tools(session.get("known_caller", True)) : une
        # session sans le champ (ancienne API web) doit garder le comportement
        # d'avant, outils complets.
        full = tools.inbound_tools()
        self.assertGreater(len(full.standard_tools), len(tools.PUBLIC_TOOLS))


if __name__ == "__main__":
    unittest.main()
