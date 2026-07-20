import { afterEach, describe, expect, it } from "vitest";
import {
  type CallerContext,
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  clampVoiceSpeed,
  inboundFirstMessage,
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
  recapOffer: false,
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

  it("injecte les consignes en espagnol quand la langue est 'es'", () => {
    const prompt = inboundSystemPrompt(ctx({ language: "es", agentInstructions: "Háblame de usted." }));
    expect(prompt).toContain("Háblame de usted.");
    expect(prompt).toContain("Lo que la persona te ha pedido");
    expect(prompt.indexOf("Háblame de usted.")).toBeLessThan(prompt.indexOf("Regla de oro"));
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

// L'offre de résumé se joue dans le message d'accueil. Ce qui est en jeu : un
// appel qui s'ouvre sur le résumé récité de la fois d'avant fait payer à CHAQUE
// appel une chose qu'on voulait une fois — et sans écran, on ne peut ni le
// passer ni le survoler, seulement attendre la fin. On propose, on n'impose pas.
describe("inboundFirstMessage — l'offre de résumé", () => {
  it("leaves the greeting untouched when there is nothing to offer", () => {
    for (const language of ["fr", "en", "es"] as const) {
      const greeting = inboundFirstMessage(ctx({ language }));
      expect(greeting).not.toMatch(/résumer|recap|resumirte/);
      // Une seule question : celle qui ouvre l'appel.
      expect(greeting.match(/\?/g) ?? []).toHaveLength(1);
    }
  });

  it("adds one short offer, in the caller's language", () => {
    expect(inboundFirstMessage(ctx({ language: "fr", recapOffer: true }))).toContain(
      "Je peux te résumer notre dernier appel si tu veux.",
    );
    expect(inboundFirstMessage(ctx({ language: "en", recapOffer: true }))).toContain(
      "I can recap our last call if you want.",
    );
    expect(inboundFirstMessage(ctx({ language: "es", recapOffer: true }))).toContain(
      "Puedo resumirte nuestra última llamada si quieres.",
    );
  });

  it("keeps the offer ahead of the open question, so ignoring it costs nothing", () => {
    // Qui n'en veut pas répond à la question et n'entend jamais le résumé : il
    // n'a rien eu à refuser. C'est pour ça que l'offre passe en premier.
    const greeting = inboundFirstMessage(ctx({ language: "en", recapOffer: true }));
    expect(greeting.indexOf("I can recap")).toBeLessThan(greeting.indexOf("What can I do for you?"));
  });

  it("offers the recap without leaking a word of what is in it", () => {
    const greeting = inboundFirstMessage(ctx({ language: "en", recapOffer: true }));
    expect(greeting.split(". ").length).toBeLessThanOrEqual(4);
    expect(greeting).not.toContain("Summary of your call");
  });

  it("still works for someone who never set a preferred name", () => {
    const greeting = inboundFirstMessage(ctx({ language: "fr", preferredName: null, recapOffer: true }));
    expect(greeting).toContain("Bonjour !");
    expect(greeting).toContain("Je peux te résumer notre dernier appel si tu veux.");
  });
});

// Le prompt annonce la capacité, et interdit de la déclencher tout seul.
describe("inboundSystemPrompt — le résumé se demande", () => {
  it("names the tool and forbids reciting a summary unprompted", () => {
    expect(inboundSystemPrompt(ctx({ language: "fr" }))).toContain("ne récite JAMAIS un résumé de toi-même");
    expect(inboundSystemPrompt(ctx({ language: "en" }))).toContain("NEVER recite a summary on your own");
    expect(inboundSystemPrompt(ctx({ language: "es" }))).toContain("NUNCA recites un resumen por tu cuenta");
    for (const language of ["fr", "en", "es"] as const)
      expect(inboundSystemPrompt(ctx({ language }))).toContain("get_last_call_summary");
  });
});

// Manque de capacité : l'agent le remonte (report_unsupported_request) au lieu de
// refuser sèchement, et n'offre le SMS que si l'envoi est réellement branché — on
// ne promet jamais un texte qu'on ne peut pas envoyer.
const OLD_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...OLD_ENV };
});

function withSmsOn() {
  process.env.TWILIO_ACCOUNT_SID = "sid";
  process.env.TWILIO_AUTH_TOKEN = "tok";
  process.env.TWILIO_FROM_NUMBER = "+10000000000";
}
function withSmsOff() {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
}

describe("inboundSystemPrompt — remontée des manques de capacité", () => {
  it("always instructs the agent to call report_unsupported_request", () => {
    withSmsOff();
    const p = inboundSystemPrompt(ctx({ language: "en" }));
    expect(p).toContain("report_unsupported_request");
    expect(p).toContain("noted it so it will be added");
  });

  it("offers the SMS only when a send-capable SMS provider is connected", () => {
    withSmsOff();
    expect(inboundSystemPrompt(ctx({ language: "en" }))).not.toContain("SMS when it's done");

    withSmsOn();
    expect(inboundSystemPrompt(ctx({ language: "en" }))).toContain("SMS when it's done");
  });
});
