// Adaptateur de format d'outils : Vapi -> Anthropic Messages API.
//
// agents/tools.ts décrit les outils au format Vapi (`{ function: { name,
// description, parameters } }`) — c'est LA source unique, lue par la voix. Le
// canal texte héberge sa propre boucle LLM (agents/loop.ts) et appelle
// directement l'API Anthropic, qui attend `{ name, description, input_schema }`.
// On dérive donc, on ne recopie pas : ajouter un outil dans tools.ts le rend
// disponible au texte sans rien toucher ici.

import { agentTools } from "./tools";

export type AnthropicTool = {
  name: string;
  description: string;
  // JSON Schema (type object) — identique à `function.parameters` côté Vapi.
  input_schema: Record<string, unknown>;
};

export function anthropicTools(): AnthropicTool[] {
  return agentTools().map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}
