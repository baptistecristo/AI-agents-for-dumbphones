// Boucle d'agent pour le canal TEXTE.
//
// En appel, c'est la plateforme vocale (Vapi) qui héberge la boucle LLM et ne
// nous appelle que pour EXÉCUTER les outils (/api/vapi/webhook). Le texte n'a pas
// d'hôte pour ça : on tient la boucle ici — appel au modèle, exécution des
// outils via la MÊME couche skills que la voix (executeTool), et on recommence
// jusqu'à une réponse en texte. « Un cerveau, deux canaux » (§4 du doc d'archi) :
// rien sous executeTool ne sait de quel canal vient le tour.
//
// L'appel au modèle est injectable (`callModel`) : la boucle se teste ainsi sans
// réseau, avec un modèle simulé. Le défaut tape l'API Messages d'Anthropic en
// `fetch` — pas de SDK, comme vapi.ts.

import { env, envOr } from "../env";
import { executeTool } from "../skills";
import { CallSession, t } from "../skills/types";
import { anthropicTools, type AnthropicTool } from "./anthropic-tools";

// Un tour de conversation reconstitué (depuis sms_logs) : le fil que le modèle
// doit voir pour tenir un échange en plusieurs messages (proposer → « oui » → agir).
export type TextTurn = { role: "user" | "assistant"; content: string };

// Bloc de contenu Anthropic (typage volontairement lâche : pas de SDK).
export type ContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input?: any;
};
export type AnthropicMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };
export type ModelRequest = { system: string; messages: AnthropicMessage[]; tools: AnthropicTool[]; model: string };
export type ModelResponse = { content: ContentBlock[]; stop_reason: string | null };
export type CallModel = (req: ModelRequest) => Promise<ModelResponse>;

// Défaut : API Messages Anthropic en fetch. Modèle = celui du profil vocal
// (AGENT_MODEL) pour ne pas diverger. Non-streaming, max_tokens court : une
// réponse SMS tient en quelques phrases.
async function anthropicFetch(req: ModelRequest): Promise<ModelResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 1024,
      system: req.system,
      tools: req.tools,
      messages: req.messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status} ${await res.text()}`);
  const json = (await res.json()) as ModelResponse;
  return { content: json.content ?? [], stop_reason: json.stop_reason ?? null };
}

function textOf(blocks: ContentBlock[]): string {
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export type RunTextTurnParams = {
  session: CallSession;
  systemPrompt: string;
  history: TextTurn[];
  userText: string;
  tools?: AnthropicTool[];
  callModel?: CallModel;
  maxSteps?: number; // garde-fou anti-boucle sur les tool_use
};

// Exécute un tour : injecte l'historique + le message reçu, laisse le modèle
// appeler des outils, et renvoie le texte final à envoyer par SMS.
export async function runTextTurn(params: RunTextTurnParams): Promise<string> {
  const { session, systemPrompt, history, userText } = params;
  const tools = params.tools ?? anthropicTools();
  const callModel = params.callModel ?? anthropicFetch;
  const maxSteps = params.maxSteps ?? 6;
  const model = envOr("AGENT_MODEL", "claude-haiku-4-5-20251001");

  const messages: AnthropicMessage[] = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: userText },
  ];

  let lastText = "";
  for (let step = 0; step < maxSteps; step++) {
    const resp = await callModel({ system: systemPrompt, messages, tools, model });
    messages.push({ role: "assistant", content: resp.content });
    lastText = textOf(resp.content) || lastText;

    if (resp.stop_reason !== "tool_use") {
      return lastText || fallback(session);
    }

    const toolUses = resp.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) return lastText || fallback(session);

    const results: ContentBlock[] = [];
    for (const call of toolUses) {
      const result = await executeTool(call.name ?? "", call.input ?? {}, session);
      results.push({ type: "tool_result", id: call.id, text: result });
    }
    // tool_result attend `tool_use_id` + `content`, pas notre forme interne.
    messages.push({
      role: "user",
      content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.text }) as unknown as ContentBlock),
    });
  }

  // Boucle plafonnée sans réponse finale : on rend au moins le dernier texte.
  return lastText || fallback(session);
}

function fallback(session: CallSession): string {
  return t(session, {
    fr: "Désolé, je n'ai pas pu traiter ça. Réessaie en une phrase, ou appelle-moi 📞",
    en: "Sorry, I couldn't handle that. Try again in one sentence, or call me 📞",
    es: "Lo siento, no he podido con eso. Inténtalo en una frase, o llámame 📞",
  });
}
