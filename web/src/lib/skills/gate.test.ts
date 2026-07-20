import { describe, expect, it } from "vitest";
import { agentTools } from "../agents/tools";
import { TOOL_POLICY, isClassified, requiresVerification, requiresVerificationOverSms } from "./gate";

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

  it("protects the recap of a previous call: it reports what was said", () => {
    // L'opt-in (consents) décide si la fonction existe pour cette personne ; le
    // code décide qui, sur la ligne, a le droit de l'entendre. Un caller-ID
    // usurpé ne doit pas suffire à se faire relire une conversation.
    expect(requiresVerification("get_last_call_summary")).toBe(true);
  });

  it("fails closed: an unclassified tool demands the code instead of sailing through", () => {
    expect(requiresVerification("totally_unknown_tool")).toBe(true);
    expect(isClassified("totally_unknown_tool")).toBe(false);
  });

  it("treats the recap as a read over text: the reply only reaches the registered number", () => {
    // Par texte, une lecture n'a rien à protéger d'un usurpateur — c'est la
    // victime qui reçoit la réponse. Le résumé suit donc recall et list_events,
    // pas les écritures.
    expect(requiresVerificationOverSms("get_last_call_summary")).toBe(false);
    expect(requiresVerificationOverSms("mark_done")).toBe(true);
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
