// Le routeur SMS est une seconde porte vers les mêmes skills que la voix. Ces
// tests tiennent une seule frontière : ce que TOOL_POLICY classe "code" ne
// s'exécute pas parce qu'on l'a demandé par SMS. Le cas qui a motivé le fichier
// est FAIT/DONE : il éteignait un rappel « pending », donc le cron ne l'envoyait
// plus, sur la seule foi d'un identifiant d'expéditeur — qui s'usurpe.
//
// On mocke les skills plutôt que la base : ce qui se vérifie ici n'est pas ce
// que le skill répond, c'est qu'il n'est même pas ATTEINT.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CODE_TOOL_EFFECT, TOOL_POLICY, requiresVerificationOverSms } from "./skills/gate";
import { CallSession } from "./skills/types";

vi.mock("./skills/reminders", () => ({
  markDone: vi.fn(async () => "FAIT EXÉCUTÉ"),
  setReminder: vi.fn(async () => "RAPPEL POSÉ"),
  listReminders: vi.fn(async () => "RAPPELS LISTÉS"),
  didIAlready: vi.fn(async () => "DÉJÀ RÉPONDU"),
}));
vi.mock("./skills/agenda", () => ({ listEvents: vi.fn(async () => "AGENDA LU") }));
vi.mock("./skills/weather", () => ({ getWeather: vi.fn(async () => "MÉTÉO DITE") }));
vi.mock("./skills/directions", () => ({ getDirections: vi.fn(async () => "ITINÉRAIRE CALCULÉ") }));
// L'adresse du profil varie d'un test à l'autre : c'est elle qu'on regarde
// partir (ou non) vers le géocodeur.
const profile = { home_address: "12 rue des Lilas, 69003 Lyon" };

vi.mock("./supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }),
    }),
  }),
}));

import { listEvents } from "./skills/agenda";
import { getWeather } from "./skills/weather";
import { didIAlready, listReminders, markDone, setReminder } from "./skills/reminders";
import { handleSmsCommand } from "./sms-commands";

// Le pire cas réaliste : un compte reconnu (l'identifiant d'expéditeur porte un
// numéro enregistré) et aucun code, ce que le canal SMS ne peut jamais fournir.
const smsSession = (language: "fr" | "en" | "es" = "fr"): CallSession => ({
  callId: "sms",
  channel: "text",
  userId: "user-1",
  callerNumber: "+33600000000",
  verified: false,
  trustedCaller: false,
  language,
});

beforeEach(() => {
  vi.clearAllMocks();
  // gatedOverSms change de texte sans service Verify. Le refus, lui, ne change
  // pas : les deux branches sont couvertes plus bas, explicitement.
  process.env.TWILIO_ACCOUNT_SID = "AC0000";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_VERIFY_SERVICE_SID = "VA0000";
});

describe("le routeur SMS applique TOOL_POLICY", () => {
  it("n'exécute pas mark_done : FAIT n'éteint plus un rappel sans code", async () => {
    // Le test qui compte. Avant, ceci renvoyait « Noté : ... est fait » et le
    // rappel de 8 h ne partait jamais — sans que personne ne le remarque,
    // puisqu'un rappel qui n'arrive pas ne se remarque pas.
    const reply = await handleSmsCommand(smsSession(), "FAIT prendre médicament");
    expect(markDone).not.toHaveBeenCalled();
    expect(reply).not.toBe("FAIT EXÉCUTÉ");
    expect(reply).toContain("code");
  });

  it("refuse DONE comme FAIT : l'alias anglais n'est pas une porte de service", async () => {
    const reply = await handleSmsCommand(smsSession("en"), "DONE take pills");
    expect(markDone).not.toHaveBeenCalled();
    expect(reply).toContain("code");
  });

  it("refuse HECHO comme FAIT : l'alias espagnol non plus", async () => {
    const reply = await handleSmsCommand(smsSession("es"), "HECHO tomar medicación");
    expect(markDone).not.toHaveBeenCalled();
    expect(reply).toContain("código");
  });

  it("refuse FAIT sans argument sans proposer un format qui n'aboutirait pas", async () => {
    // Le gate passe AVANT la vérification d'argument : « Format : FAIT ... »
    // inviterait à réessayer une commande refusée de toute façon.
    const reply = await handleSmsCommand(smsSession(), "FAIT");
    expect(markDone).not.toHaveBeenCalled();
    expect(reply).not.toContain("Format");
  });

  it("exécute list_events : par SMS, l'usurpateur déclenche une lecture qu'il ne lira pas", async () => {
    // AGENDA reste "code" en appel, où l'usurpateur ENTENDRAIT la réponse. Par
    // SMS elle part au numéro enregistré : il ne peut que faire lire la victime
    // à elle-même. Refuser ici supprimerait la commande sans rien protéger.
    const reply = await handleSmsCommand(smsSession(), "AGENDA demain");
    expect(listEvents).toHaveBeenCalled();
    expect(reply).toBe("AGENDA LU");
  });

  it("dit la vérité quand l'envoi de codes n'est pas configuré : « appelez-moi » serait faux", async () => {
    // Sans service Verify, l'appel refuserait exactement pareil (index.ts).
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    const reply = await handleSmsCommand(smsSession(), "FAIT prendre médicament");
    expect(markDone).not.toHaveBeenCalled();
    expect(reply).toContain("hors service");
    expect(reply).not.toContain("Appelez-moi");
  });

  it("n'annonce pas dans l'AIDE les commandes qu'il refusera, et annonce les autres", async () => {
    const help = await handleSmsCommand(smsSession(), "AIDE");
    expect(help).not.toContain("FAIT <quoi>");
    expect(help).toContain("AGENDA");
  });
});

describe("la règle du SMS se dérive de TOOL_POLICY, elle ne se recopie pas", () => {
  // La seule bonne objection à une règle par canal est qu'un second tableau
  // finit par mentir. Celui-ci est dérivé : ces tests tiennent la dérivation,
  // pas la liste.
  it("laisse passer les lectures protégées et arrête les écritures protégées", () => {
    expect(requiresVerificationOverSms("list_events")).toBe(false);
    expect(requiresVerificationOverSms("find_contact")).toBe(false);
    expect(requiresVerificationOverSms("recall")).toBe(false);
    expect(requiresVerificationOverSms("mark_done")).toBe(true);
    expect(requiresVerificationOverSms("send_sms")).toBe(true);
    expect(requiresVerificationOverSms("place_call")).toBe(true);
    expect(requiresVerificationOverSms("create_event")).toBe(true);
    expect(requiresVerificationOverSms("move_event")).toBe(true);
  });

  it("laisse tranquille ce que le gate classe déjà \"free\"", () => {
    for (const n of ["get_weather", "get_directions", "list_reminders", "did_i_already", "set_reminder"])
      expect(requiresVerificationOverSms(n)).toBe(false);
  });

  it("fail-closed : un outil inconnu exige le code par SMS aussi", () => {
    expect(requiresVerificationOverSms("totally_unknown_tool")).toBe(true);
    expect(requiresVerificationOverSms("constructor")).toBe(true);
  });

  it("couvre exactement les outils \"code\", sans trou ni ligne morte", () => {
    // Si TOOL_POLICY gagne un outil "code", il doit apparaître ici. tsc le dit
    // déjà (Record<CodeToolName, …>) ; ce test le dit en clair si le typage
    // venait à être relâché.
    const codeTools = Object.entries(TOOL_POLICY)
      .filter(([, p]) => p === "code")
      .map(([n]) => n)
      .sort();
    expect(Object.keys(CODE_TOOL_EFFECT).sort()).toEqual(codeTools);
  });
});

describe("le routeur SMS laisse passer ce que le gate laisse libre", () => {
  // Le refus doit rester ciblé : fermer FAIT en fermant tout le canal SMS
  // reviendrait à supprimer la fonctionnalité, pas à la protéger.
  it("pose un rappel : set_reminder est additif, donc libre", async () => {
    expect(await handleSmsCommand(smsSession(), "RAPPEL 18h30 prendre médicament")).toBe("RAPPEL POSÉ");
    expect(setReminder).toHaveBeenCalled();
  });

  it("liste les rappels et répond à DEJA : ce sont des lectures", async () => {
    expect(await handleSmsCommand(smsSession(), "RAPPELS")).toBe("RAPPELS LISTÉS");
    expect(listReminders).toHaveBeenCalled();
    expect(await handleSmsCommand(smsSession(), "DEJA pris médicament")).toBe("DÉJÀ RÉPONDU");
    expect(didIAlready).toHaveBeenCalled();
  });

  it("répond météo et itinéraire sans code", async () => {
    expect(await handleSmsCommand(smsSession(), "METEO Lyon")).toBe("MÉTÉO DITE");
    expect(await handleSmsCommand(smsSession(), "ROUTE gare de Lyon")).toBe("ITINÉRAIRE CALCULÉ");
  });

  it("comprend les commandes espagnoles : mêmes skills, mêmes règles", async () => {
    expect(await handleSmsCommand(smsSession("es"), "RECUERDA 18:30 tomar medicación")).toBe("RAPPEL POSÉ");
    expect(await handleSmsCommand(smsSession("es"), "RECORDATORIOS")).toBe("RAPPELS LISTÉS");
    expect(await handleSmsCommand(smsSession("es"), "YA tomé medicación")).toBe("DÉJÀ RÉPONDU");
    expect(await handleSmsCommand(smsSession("es"), "TIEMPO Madrid")).toBe("MÉTÉO DITE");
    expect(await handleSmsCommand(smsSession("es"), "RUTA Calle Mayor 12, Madrid")).toBe("ITINÉRAIRE CALCULÉ");
    const help = await handleSmsCommand(smsSession("es"), "AYUDA");
    expect(help).toContain("TIEMPO");
    expect(help).not.toContain("HECHO <");
  });
});

describe("l'inconnu ne passe pas par le routeur SMS", () => {
  it("ne répond rien de personnel à un expéditeur sans compte", async () => {
    const reply = await handleSmsCommand({ ...smsSession(), userId: null }, "FAIT prendre médicament");
    expect(markDone).not.toHaveBeenCalled();
    expect(reply).toContain("assistant vocal personnel");
  });
});

describe("METEO ne fait pas sortir la rue", () => {
  // METEO est "free" : aucun code ne l'arrête, donc la seule protection de
  // l'adresse est la réduction à la ville. Elle était écrite deux fois — ici et
  // dans index.ts — et la copie d'ici gardait la ligne entière. Ce que le gate
  // ne peut pas couvrir (un ARGUMENT, pas un nom d'outil) se tient donc ici.
  it("n'envoie que la ville quand l'adresse en porte une", async () => {
    profile.home_address = "12 rue des Lilas, 69003 Lyon";
    await handleSmsCommand(smsSession(), "METEO");
    expect(getWeather).toHaveBeenCalledWith(expect.anything(), expect.anything(), "Lyon");
  });

  it("préfère ne rien donner plutôt que la rue, sans code postal ni virgule", async () => {
    // Le champ est du texte libre : rien n'impose l'un ni l'autre.
    profile.home_address = "12 rue des Lilas Lyon";
    await handleSmsCommand(smsSession(), "METEO");
    expect(getWeather).toHaveBeenCalledWith(expect.anything(), expect.anything(), null);
  });

  // Ce cas-là passait déjà : l'ancienne version coupait sur les virgules avant
  // de retirer le code postal, donc un numéro de rue à cinq chiffres ne la
  // trompait pas. Il reste pour que la bascule vers cityFromAddress, elle, ne
  // le casse pas.
  it("ne prend pas un numéro de rue à cinq chiffres pour un code postal", async () => {
    profile.home_address = "12345 route des Vignes, 33000 Bordeaux";
    await handleSmsCommand(smsSession(), "METEO");
    expect(getWeather).toHaveBeenCalledWith(expect.anything(), expect.anything(), "Bordeaux");
  });
});

describe("la table du gate reste la seule source", () => {
  // Ce test ne teste pas le routeur mais l'HYPOTHÈSE sur laquelle il repose :
  // si mark_done ou list_events repassait "free" dans gate.ts, les refus
  // ci-dessus deviendraient verts en testant le contraire de leur intention.
  it("classe toujours \"code\" les outils que le routeur refuse", () => {
    expect(TOOL_POLICY.mark_done).toBe("code");
    expect(TOOL_POLICY.list_events).toBe("code");
  });
});
