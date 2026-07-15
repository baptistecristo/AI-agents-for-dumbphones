// runtime/tools.py se déclare « miroir exact de web/src/lib/agents/tools.ts ».
// Rien ne le vérifiait : les deux listes sont tenues à la main, et gate.test.ts
// ne lit que celle en TypeScript.
//
// L'oubli silencieux va dans ce sens-là : un outil ajouté au seul runtime
// Pipecat est annoncé au modèle, appelé, puis refusé par executeTool (absent de
// TOOL_POLICY) — l'appelant entend « Outil inconnu » à chaque tentative, sans
// qu'aucun test ne rougisse. Le sens inverse casse gate.test.ts, ce qui est déjà
// le cas voulu.
//
// On lit la source Python plutôt que de l'exécuter : pas d'interpréteur dans le
// job de tests web, et la liste est de toute façon littérale.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { agentTools } from "../agents/tools";

const toolsPy = () => readFileSync(fileURLToPath(new URL("../../../../runtime/tools.py", import.meta.url)), "utf8");

// Le corps de inbound_tools(), jusqu'à la prochaine définition de premier niveau.
function inboundToolsBody(source: string): string {
  const start = source.indexOf("def inbound_tools()");
  expect(start, "runtime/tools.py ne déclare plus inbound_tools()").toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf("\ndef ", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

// end_call est traité localement par make_tool_handler (raccroche, ne passe
// jamais par /api/tools/execute) : il n'a rien à faire dans TOOL_POLICY.
const LOCAL_TO_RUNTIME = ["end_call"];

function pythonInboundToolNames(): string[] {
  const body = inboundToolsBody(toolsPy());
  const names = [...body.matchAll(/_schema\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  if (/\bEND_CALL\b/.test(body)) names.push("end_call");
  return names.filter((n) => !LOCAL_TO_RUNTIME.includes(n)).sort();
}

describe("runtime/tools.py mirrors agents/tools.ts", () => {
  it("declares exactly the inbound tools the Next.js runtime can execute", () => {
    expect(pythonInboundToolNames()).toEqual(agentTools().map((tool) => tool.function.name).sort());
  });

  it("still finds a non-empty list, so a parsing change cannot make this test vacuous", () => {
    expect(pythonInboundToolNames().length).toBeGreaterThan(5);
  });
});
