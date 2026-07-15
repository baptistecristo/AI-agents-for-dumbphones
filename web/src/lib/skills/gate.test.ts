import { describe, expect, it } from "vitest";
import { agentTools } from "../agents/tools";
import { TOOL_POLICY, isClassified, requiresVerification } from "./gate";

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

  it("leaves reminders free: requiring a code to answer did_i_already costs more than it protects", () => {
    for (const n of ["list_reminders", "did_i_already", "mark_done"]) expect(requiresVerification(n)).toBe(false);
  });

  it("leaves light writes, generic queries, and the auth tools free", () => {
    for (const n of ["get_weather", "get_directions", "get_current_time", "set_reminder", "remember", "request_code", "verify_code"])
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
