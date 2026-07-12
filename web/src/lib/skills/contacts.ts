// Skill Contacts — Google People (lecture seule).

import { google } from "googleapis";
import { googleFor } from "../google";
import { CallSession, SkillResult } from "./types";

export async function findContact(session: CallSession, args: { name: string }): Promise<SkillResult> {
  if (!session.userId) return "Appelant non identifié : pas d'accès aux contacts.";
  const auth = await googleFor(session.userId);
  if (!auth) return "Le compte Google n'est pas connecté (à faire sur le site).";
  const people = google.people({ version: "v1", auth });
  const res = await people.people.searchContacts({
    query: args.name,
    readMask: "names,phoneNumbers",
    pageSize: 3,
  });
  const results = res.data.results ?? [];
  if (results.length === 0) return `Aucun contact trouvé pour « ${args.name} ».`;
  const lines = results.map((r) => {
    const name = r.person?.names?.[0]?.displayName ?? "Sans nom";
    const phone = r.person?.phoneNumbers?.[0]?.value ?? "pas de numéro";
    return `- ${name} : ${phone}`;
  });
  return `Contacts trouvés :\n${lines.join("\n")}`;
}

// Résout un nom -> numéro E.164 (utilisé par send_sms et place_call)
export async function resolveContactNumber(session: CallSession, name: string): Promise<string | null> {
  if (!session.userId) return null;
  const auth = await googleFor(session.userId);
  if (!auth) return null;
  const people = google.people({ version: "v1", auth });
  const res = await people.people.searchContacts({
    query: name,
    readMask: "names,phoneNumbers",
    pageSize: 1,
  });
  const raw = res.data.results?.[0]?.person?.phoneNumbers?.[0]?.canonicalForm
    ?? res.data.results?.[0]?.person?.phoneNumbers?.[0]?.value;
  if (!raw) return null;
  const cleaned = raw.replace(/[\s.-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 10) return `+33${cleaned.slice(1)}`;
  return cleaned;
}
