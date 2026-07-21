// La boucle d'agent texte se teste sans réseau : callModel est injecté, et la
// couche skills (executeTool) est simulée. On vérifie le flux, pas les skills.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallSession } from "../skills/types";
import { runTextTurn, type CallModel, type ModelResponse } from "./loop";

vi.mock("../skills", () => ({ executeTool: vi.fn(async () => "TOOL_RESULT") }));
import { executeTool } from "../skills";

const session: CallSession = {
  callId: "sms",
  channel: "text",
  userId: "u1",
  callerNumber: "+33600000000",
  verified: false,
  trustedCaller: false,
  language: "fr",
};

const textResp = (text: string): ModelResponse => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolResp = (name: string, input: any): ModelResponse => ({
  content: [{ type: "tool_use", id: "t1", name, input }],
  stop_reason: "tool_use",
});

beforeEach(() => vi.clearAllMocks());

describe("runTextTurn", () => {
  it("renvoie le texte du modèle quand il n'y a pas d'appel d'outil", async () => {
    const callModel: CallModel = vi.fn(async () => textResp("Bonjour !"));
    const out = await runTextTurn({ session, systemPrompt: "sys", history: [], userText: "salut", tools: [], callModel });
    expect(out).toBe("Bonjour !");
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("exécute l'outil demandé puis renvoie la réponse de suivi", async () => {
    const responses = [toolResp("get_weather", { city: "Lyon" }), textResp("Il fait beau.")];
    let i = 0;
    const callModel: CallModel = vi.fn(async () => responses[i++]);
    const out = await runTextTurn({ session, systemPrompt: "sys", history: [], userText: "météo lyon", tools: [], callModel });
    expect(out).toBe("Il fait beau.");
    expect(executeTool).toHaveBeenCalledWith("get_weather", { city: "Lyon" }, session);
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("injecte l'historique puis le message reçu, en commençant par « user »", async () => {
    // La boucle mute le tableau `messages` par référence (elle y pousse la
    // réponse assistant) : on en fige une copie à l'appel, avant la mutation.
    let firstCallMessages: unknown[] = [];
    const callModel: CallModel = vi.fn(async (req) => {
      if (firstCallMessages.length === 0) firstCallMessages = [...req.messages];
      return textResp("ok");
    });
    await runTextTurn({
      session,
      systemPrompt: "sys",
      history: [
        { role: "user", content: "salut" },
        { role: "assistant", content: "bonjour" },
      ],
      userText: "encore",
      tools: [],
      callModel,
    });
    expect(firstCallMessages[0]).toEqual({ role: "user", content: "salut" });
    expect(firstCallMessages.at(-1)).toEqual({ role: "user", content: "encore" });
  });

  it("s'arrête au plafond de tours si le modèle boucle sur des outils", async () => {
    const callModel: CallModel = vi.fn(async () => toolResp("get_weather", {}));
    const out = await runTextTurn({ session, systemPrompt: "sys", history: [], userText: "x", tools: [], callModel, maxSteps: 3 });
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(out).toContain("📞"); // texte de repli
  });
});
