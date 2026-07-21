// Fin d'appel : sortir les engagements du transcript et les écrire dans
// reminders, la table qui répond déjà à « est-ce que j'ai déjà… ? ».
//
// call_logs.transcript est rempli à chaque appel depuis 0001 et n'était lu par
// personne. Ce fichier est son premier lecteur, et il ne lit que sous quatre
// conditions cumulatives :
//
//   1. l'appel est ENTRANT. Un appel sortant enregistre un tiers qui n'a rien
//      accepté — il n'entre jamais ici, quel que soit le consentement du compte
//      qui l'a déclenché ;
//   2. l'appelant est identifié, donc rattaché à un registre de consentement ;
//   3. ce compte a explicitement autorisé la source « action_items ». Défaut :
//      REFUSÉ. Pas d'autorisation, pas de lecture — et surtout pas de repli sur
//      « recording », qui couvre une autre finalité (garder le transcript) que
//      celle-ci (en tirer des engagements et les écrire ailleurs) ;
//   4. rien n'a déjà été extrait de cet appel. Le rapport de fin d'appel peut
//      être rejoué ; deux rejeux ne doivent pas faire deux fois les rappels.
//
// L'appel au modèle est injectable (`extract`), comme agents/loop.ts : tout ce
// qui décide se teste sans réseau.

import { envOr } from "../env";
import { Language, normalizeLanguage } from "../language";
import { supabaseAdmin } from "../supabase/admin";

// La source du registre de consentement (consents.source). Un seul endroit.
export const ACTION_ITEMS_CONSENT = "action_items";

const MAX_ITEMS = 5;
const MAX_TEXT_LENGTH = 200;
// Le transcript d'un appel plafonné à 180 s tient très largement dedans ; la
// borne protège le coût et la fenêtre de contexte si le plafond change.
const MAX_TRANSCRIPT_LENGTH = 20_000;
// Une échéance au-delà d'un an ne vient pas d'un appel de quelques minutes :
// c'est une date mal lue. On la jette plutôt que de poser un rappel fantôme.
const MAX_DUE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

export type ActionItem = { text: string; due_at: string | null };

export type ExtractActionItems = (params: { transcript: string; language: Language }) => Promise<string>;

// La ligne de call_logs dont dépend la décision. Volontairement étroite : rien
// d'autre de l'appel n'entre dans ce fichier.
export type CallForExtraction = {
  id: string;
  user_id: string | null;
  direction: string | null;
  transcript: string | null;
};

export type ExtractionVerdict = { extract: true } | { extract: false; reason: string };

const LANGUAGE_NAME: Record<Language, string> = { fr: "French", en: "English", es: "Spanish" };

// ---------------------------------------------------------------------------
// La décision. Pure : aucune base, aucun réseau.
// ---------------------------------------------------------------------------

// Fail-closed dans tous les sens. Chaque refus porte sa raison, parce que
// « rien ne s'est passé » est indébogable dans un webhook.
export function extractionVerdict(
  call: CallForExtraction,
  opts: { consentGranted: boolean; alreadyExtracted: boolean; modelConfigured: boolean },
): ExtractionVerdict {
  // L'ordre compte : on refuse sur le tiers non consentant AVANT de regarder
  // quoi que ce soit d'autre. Un appel sortant ne doit jamais dépendre d'un
  // réglage qu'on pourrait un jour inverser par erreur.
  if (call.direction !== "inbound") return { extract: false, reason: "appel non entrant" };
  if (!call.user_id) return { extract: false, reason: "appelant non identifié" };
  if (!opts.consentGranted) return { extract: false, reason: "consentement action_items absent" };
  if (opts.alreadyExtracted) return { extract: false, reason: "déjà extrait" };
  if (!call.transcript || call.transcript.trim().length === 0)
    return { extract: false, reason: "transcript vide" };
  if (!opts.modelConfigured) return { extract: false, reason: "aucune clé de modèle configurée" };
  return { extract: true };
}

// Le prompt est destiné au modèle, pas à l'appelant : il reste en anglais comme
// agents/tools.ts. Ce qui doit suivre la langue de l'appel, c'est la LANGUE DES
// RAPPELS PRODUITS — une personne qui appelle en espagnol ne doit pas relire
// des rappels en anglais.
export function buildExtractionPrompt(language: Language, now: Date = new Date()): string {
  return [
    "You read the transcript of one phone call and extract the commitments the caller made.",
    "",
    "Answer with a JSON array and nothing else. No prose, no code fence. Each entry:",
    '  {"text": "<the commitment, one short sentence>", "due_at": "<ISO 8601 timestamp, or null>"}',
    "",
    "Rules:",
    "- Only include something the CALLER said they would do, or explicitly asked to be reminded of.",
    "- Never include what the assistant did during the call, topics discussed, or questions asked.",
    "- If the transcript contains no clear commitment, answer with an empty array: []",
    "- Never invent a deadline. due_at stays null unless the transcript names a date or a time.",
    `- The call happened on ${now.toISOString()}. Resolve "tomorrow", "Monday" and the like against that.`,
    `- Write every "text" in ${LANGUAGE_NAME[language]}, the language of the call.`,
    `- At most ${MAX_ITEMS} entries.`,
  ].join("\n");
}

// Tolérant en entrée, strict en sortie : ce qui sort d'ici s'écrit en base.
// Ne lève jamais — un modèle qui répond de travers ne doit pas faire échouer la
// fin d'appel, il doit produire zéro rappel.
export function parseActionItems(raw: string, now: Date = new Date()): ActionItem[] {
  const parsed = parseJsonArray(raw);
  if (!parsed) return [];

  const items: ActionItem[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as { text?: unknown; due_at?: unknown };
    if (typeof candidate.text !== "string") continue;
    const text = candidate.text.trim().slice(0, MAX_TEXT_LENGTH);
    if (text.length === 0) continue;
    // Le modèle reformule parfois deux fois le même engagement.
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ text, due_at: parseDueAt(candidate.due_at, now) });
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

function parseJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Les modèles encadrent volontiers le JSON d'une clôture ```json.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const direct = tryParse(unfenced);
  if (direct) return direct;
  // Dernier recours : le tableau est noyé dans de la prose.
  const start = unfenced.indexOf("[");
  const end = unfenced.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  return tryParse(unfenced.slice(start, end + 1));
}

function tryParse(text: string): unknown[] | null {
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Une échéance passée ferait partir le rappel dans la minute (le cron prend
// tout ce qui est dû), et une échéance lointaine est une date mal lue. Les deux
// retombent sur null : le rappel existe, il est simplement sans date — c'est
// exactement ce que list_reminders sait afficher.
function parseDueAt(value: unknown, now: Date): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms <= now.getTime()) return null;
  if (ms - now.getTime() > MAX_DUE_AHEAD_MS) return null;
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Les accès : base et modèle.
// ---------------------------------------------------------------------------

export function modelConfigured(): boolean {
  return envOr("ANTHROPIC_API_KEY", "").length > 0;
}

// Dernier état de la source dans le registre (vue current_consents). Absent =
// jamais autorisé = refusé.
export async function hasActionItemsConsent(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("current_consents")
    .select("granted")
    .eq("user_id", userId)
    .eq("source", ACTION_ITEMS_CONSENT)
    .maybeSingle();
  return data?.granted === true;
}

async function alreadyExtracted(callId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("reminders")
    .select("id")
    .eq("source_call_id", callId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// Même forme que agents/loop.ts : fetch direct, pas de SDK, et le modèle du
// profil vocal (AGENT_MODEL) pour ne pas diverger.
async function anthropicExtract({ transcript, language }: { transcript: string; language: Language }): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": envOr("ANTHROPIC_API_KEY", ""),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: envOr("AGENT_MODEL", "claude-haiku-4-5-20251001"),
      max_tokens: 512,
      system: buildExtractionPrompt(language),
      messages: [{ role: "user", content: transcript.slice(0, MAX_TRANSCRIPT_LENGTH) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { content?: { type?: string; text?: string }[] };
  return (json.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text!)
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// L'orchestration, appelée par le webhook de fin d'appel.
// ---------------------------------------------------------------------------

export type ExtractionOutcome = { inserted: number; skipped?: string };

export async function extractCallActionItems(
  vapiCallId: string,
  extract: ExtractActionItems = anthropicExtract,
): Promise<ExtractionOutcome> {
  const db = supabaseAdmin();
  const { data: call } = await db
    .from("call_logs")
    .select("id, user_id, direction, transcript, language")
    .eq("vapi_call_id", vapiCallId)
    .maybeSingle();
  if (!call) return { inserted: 0, skipped: "appel introuvable" };

  // On n'interroge le registre que pour un appel entrant identifié : inutile de
  // lire le consentement de quelqu'un pour un appel qui ne le concerne pas.
  const consentGranted =
    call.direction === "inbound" && call.user_id ? await hasActionItemsConsent(call.user_id) : false;
  const verdict = extractionVerdict(call, {
    consentGranted,
    alreadyExtracted: consentGranted ? await alreadyExtracted(call.id) : false,
    modelConfigured: modelConfigured(),
  });
  if (!verdict.extract) return { inserted: 0, skipped: verdict.reason };

  const raw = await extract({
    transcript: call.transcript!,
    language: normalizeLanguage(call.language),
  });
  const items = parseActionItems(raw);
  if (items.length === 0) return { inserted: 0, skipped: "aucun engagement dans l'appel" };

  const { error } = await db.from("reminders").insert(
    items.map((item) => ({
      user_id: call.user_id,
      text: item.text,
      due_at: item.due_at,
      source_call_id: call.id,
    })),
  );
  if (error) {
    console.error("Rappels extraits non enregistrés", error);
    return { inserted: 0, skipped: "insertion refusée" };
  }
  return { inserted: items.length };
}
