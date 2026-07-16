import { describe, expect, it } from "vitest";
import {
  type CallerContext,
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  clampVoiceSpeed,
  inboundSystemPrompt,
} from "./inbound";

// Ce qui est en jeu : une valeur hors de [0.7, 1.2] fait refuser la voix par
// ElevenLabs, donc rate l'appel entrant. Rien ne doit sortir de la plage.
describe("clampVoiceSpeed", () => {
  it("laisse passer les débits déjà valides", () => {
    for (const speed of [VOICE_SPEED_MIN, 0.85, 1.0, 1.1, VOICE_SPEED_MAX])
      expect(clampVoiceSpeed(speed)).toBe(speed);
  });

  it("ramène les valeurs hors plage sur les bornes", () => {
    for (const tooSlow of [0.69, 0.5, 0, -3]) expect(clampVoiceSpeed(tooSlow)).toBe(VOICE_SPEED_MIN);
    for (const tooFast of [1.21, 2, 9, 1000]) expect(clampVoiceSpeed(tooFast)).toBe(VOICE_SPEED_MAX);
  });

  it("accepte un numeric renvoyé en chaîne par la base ou par le formulaire", () => {
    expect(clampVoiceSpeed("0.85")).toBe(0.85);
    expect(clampVoiceSpeed("1")).toBe(1);
    expect(clampVoiceSpeed("9")).toBe(VOICE_SPEED_MAX);
  });

  it("retombe sur le débit normal pour tout ce qui n'est pas un nombre", () => {
    for (const junk of [null, undefined, "", "   ", "vite", NaN, Infinity, -Infinity, {}, []])
      expect(clampVoiceSpeed(junk)).toBe(VOICE_SPEED_DEFAULT);
  });
});

// Les consignes libres de la personne (profiles.agent_instructions) partent dans
// le prompt, mais elles ne doivent JAMAIS l'emporter sur les règles de sécurité,
// ni le noyer sous un texte démesuré.
const ctx = (over: Partial<CallerContext> = {}): CallerContext => ({
  userId: "u1",
  preferredName: "Sam",
  language: "fr",
  voiceSpeed: null,
  agentInstructions: null,
  ...over,
});

describe("inboundSystemPrompt — consignes de la personne", () => {
  it("injecte les consignes en français, avant la règle d'or", () => {
    const prompt = inboundSystemPrompt(ctx({ agentInstructions: "Vouvoie-moi toujours." }));
    expect(prompt).toContain("Vouvoie-moi toujours.");
    expect(prompt).toContain("Ce que la personne t'a demandé");
    // La sécurité gagne : les consignes apparaissent AVANT la règle d'or.
    expect(prompt.indexOf("Vouvoie-moi toujours.")).toBeLessThan(prompt.indexOf("Règle d'or"));
  });

  it("injecte les consignes en anglais quand la langue est 'en'", () => {
    const prompt = inboundSystemPrompt(ctx({ language: "en", agentInstructions: "Call me sir." }));
    expect(prompt).toContain("Call me sir.");
    expect(prompt).toContain("What the person asked of you");
    expect(prompt.indexOf("Call me sir.")).toBeLessThan(prompt.indexOf("Golden rule"));
  });

  it("n'ajoute aucune section quand il n'y a pas de consigne", () => {
    for (const empty of [null, "", "   "]) {
      const prompt = inboundSystemPrompt(ctx({ agentInstructions: empty }));
      expect(prompt).not.toContain("Ce que la personne t'a demandé");
    }
  });

  it("borne une consigne démesurée pour ne pas noyer le prompt", () => {
    const prompt = inboundSystemPrompt(ctx({ agentInstructions: "x".repeat(900) }));
    expect(prompt).toContain("x".repeat(800));
    expect(prompt).not.toContain("x".repeat(801));
    expect(prompt).toContain("…");
  });
});
