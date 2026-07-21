import { describe, expect, it } from "vitest";
import { agentTools } from "../agents/tools";
import {
  GateContext,
  TOOL_POLICY,
  isClassified,
  isConsequential,
  personalReadsUnlocked,
  requiresVerification,
  toolNeedsCode,
} from "./gate";

const declaredToolNames = () => agentTools().map((tool) => tool.function.name).sort();
const classifiedToolNames = () => Object.keys(TOOL_POLICY).sort();

describe("TOOL_POLICY covers every tool, in both directions", () => {
  // Le test qui compte. Ajouter un outil dans agents/tools.ts sans le classer
  // ici échouait autrefois en silence, du bon côté pour l'auteur et du mauvais
  // pour l'appelant : le skill marchait, sans code, pour n'importe qui capable
  // d'usurper le caller-ID. Maintenant ça casse ici, avec le nom manquant écrit
  // dans le message.
  it("classifies every tool declared to the model", () => {
    expect(classifiedToolNames()).toEqual(declaredToolNames());
  });

  it("never keeps a policy for a tool that no longer exists", () => {
    for (const name of classifiedToolNames()) expect(declaredToolNames()).toContain(name);
  });
});

describe("requiresVerification", () => {
  it("protects the calendar, contacts, recalled notes, and send/spend actions", () => {
    for (const n of ["list_events", "create_event", "move_event", "find_contact", "recall", "send_sms", "place_call"])
      expect(requiresVerification(n)).toBe(true);
  });

  it("leaves reading reminders free: a code to answer did_i_already costs more than it protects", () => {
    for (const n of ["list_reminders", "did_i_already"]) expect(requiresVerification(n)).toBe(false);
  });

  it("protects mark_done: it is the one reminder tool that destroys rather than reads", () => {
    // Éteindre un rappel « pending » empêche le cron de l'envoyer, et un rappel
    // qui n'arrive pas ne se remarque pas. La lecture reste libre au-dessus :
    // c'est la frontière lecture / écriture destructive, pas rappels / reste.
    expect(requiresVerification("mark_done")).toBe(true);
  });

  it("leaves light writes, generic queries, and the auth tools free", () => {
    for (const n of ["get_weather", "get_directions", "get_current_time", "define", "convert", "set_reminder", "remember", "request_code", "verify_code"])
      expect(requiresVerification(n)).toBe(false);
  });

  it("fails closed: an unclassified tool demands the code instead of sailing through", () => {
    expect(requiresVerification("totally_unknown_tool")).toBe(true);
    expect(isClassified("totally_unknown_tool")).toBe(false);
  });

  it("is not fooled by inherited Object properties", () => {
    // TOOL_POLICY["constructor"] est vérité-eux sans hasOwn : un outil nommé
    // "constructor" ou "toString" passerait pour classé et sauterait le gate.
    for (const n of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(isClassified(n)).toBe(false);
      expect(requiresVerification(n)).toBe(true);
    }
  });
});

// ——— Le grant durable posé pour un numéro ———

const ORDINARY: GateContext = { channel: "voice", verified: false, trustedCaller: false };
const TRUSTED: GateContext = { channel: "voice", verified: false, trustedCaller: true };

const READS = ["list_events", "find_contact", "recall"];
const CONSEQUENTIAL = ["create_event", "move_event", "mark_done", "send_sms", "place_call"];

describe("toolNeedsCode without a grant", () => {
  it("defaults to off: an ungranted caller sees exactly the old behaviour", () => {
    for (const n of [...READS, ...CONSEQUENTIAL]) expect(toolNeedsCode(n, ORDINARY)).toBe(true);
    for (const n of ["get_weather", "list_reminders", "request_code"])
      expect(toolNeedsCode(n, ORDINARY)).toBe(false);
  });

  it("is the same decision as requiresVerification for every classified tool", () => {
    // Le grant est le SEUL ajout : sans lui, la table de gauche fait toujours foi.
    for (const n of Object.keys(TOOL_POLICY)) expect(toolNeedsCode(n, ORDINARY)).toBe(requiresVerification(n));
  });
});

describe("toolNeedsCode with a granted caller", () => {
  it("uses the grant: gated READS go through without the one-time code", () => {
    for (const n of READS) expect(toolNeedsCode(n, TRUSTED)).toBe(false);
  });

  it("re-checks the code on anything that sends, spends or destroys", () => {
    // Le cœur de la garantie. Le caller-ID est usurpable, donc un grant durable
    // ne peut pas ouvrir ce qui laisse une trace après la réponse.
    for (const n of CONSEQUENTIAL) expect(toolNeedsCode(n, TRUSTED)).toBe(true);
  });

  it("classifies every code tool one way or the other, with nothing left over", () => {
    // Un outil "code" ajouté plus tard est couvert par le grant s'il lit, et
    // recontrôlé s'il écrit. Aucun cas ne peut tomber entre les deux en silence.
    const codeTools = Object.entries(TOOL_POLICY).filter(([, p]) => p === "code").map(([n]) => n);
    expect(codeTools.sort()).toEqual([...READS, ...CONSEQUENTIAL].sort());
    for (const n of codeTools) expect(toolNeedsCode(n, TRUSTED)).toBe(isConsequential(n));
  });

  it("fails closed on an unclassified tool, grant or no grant", () => {
    expect(isConsequential("totally_unknown_tool")).toBe(true);
    expect(toolNeedsCode("totally_unknown_tool", TRUSTED)).toBe(true);
    for (const n of ["constructor", "toString", "__proto__"]) expect(toolNeedsCode(n, TRUSTED)).toBe(true);
  });

  it("still lets the one-time code unlock the writes the grant refuses", () => {
    for (const n of CONSEQUENTIAL) expect(toolNeedsCode(n, { ...TRUSTED, verified: true })).toBe(false);
  });

  it("changes nothing over text, where reads are already free and writes need the PIN", () => {
    for (const n of [...READS, ...CONSEQUENTIAL, "get_weather"]) {
      const withGrant = toolNeedsCode(n, { channel: "text", verified: false, trustedCaller: true });
      const without = toolNeedsCode(n, { channel: "text", verified: false, trustedCaller: false });
      expect(withGrant).toBe(without);
    }
  });
});

describe("revoking the grant", () => {
  it("puts every gated read straight back behind the code", () => {
    // Révoquer = le drapeau retombe à faux (lib/consent.ts le relit en base à
    // chaque tour). Rien à vider : la décision est recalculée, pas mémorisée.
    for (const n of READS) {
      expect(toolNeedsCode(n, TRUSTED)).toBe(false);
      expect(toolNeedsCode(n, { ...TRUSTED, trustedCaller: false })).toBe(true);
    }
  });
});

describe("personalReadsUnlocked", () => {
  it("opens the home address to the code and to a granted number, and to nobody else", () => {
    expect(personalReadsUnlocked(ORDINARY)).toBe(false);
    expect(personalReadsUnlocked(TRUSTED)).toBe(true);
    expect(personalReadsUnlocked({ ...ORDINARY, verified: true })).toBe(true);
  });
});
