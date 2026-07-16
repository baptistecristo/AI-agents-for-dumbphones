// Autorisations : le registre de consentement. Pas un tableau de bord de
// capacités, un journal — ce que la personne a autorisé, horodaté, révocable
// ligne par ligne. Chaque bascule ajoute une ligne (table append-only) ; on ne
// promet donc pas ici qu'un « révoquer » coupe la fonction partout dans le
// système. Ce qu'on garantit, et qui est vrai, c'est la trace des choix.

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { Bubble, Card, PageIntro } from "../ui";
import { toggleConsent } from "./actions";

export const dynamic = "force-dynamic";

// Ordre d'affichage. La clé `source` est ce que connaît la base (consents.source),
// le `label` est ce que lit la personne, l'`aide` dit la portée sans surpromettre.
const CONSENTS: { source: string; label: string; aide: string }[] = [
  { source: "calendar", label: "Agenda", aide: "Lire et modifier tes rendez-vous." },
  { source: "contacts", label: "Contacts", aide: "Retrouver un nom, un numéro." },
  { source: "sms", label: "SMS", aide: "T'écrire des rappels, itinéraires, comptes-rendus." },
  { source: "outbound_calls", label: "Appels à ma place", aide: "Appeler un lieu pour toi : restaurant, taxi, rendez-vous." },
  { source: "memory", label: "Mémoire des préférences", aide: "Retenir tes lieux, tes personnes, tes habitudes." },
  { source: "recording", label: "Enregistrement des appels", aide: "Garder et transcrire tes appels pour le suivi." },
];

// Pastilles d'action. Vert « autorisé » (état franc, action = révoquer),
// neutre « refusé » (action = autoriser). Anneau de focus visible au clavier.
const grantedPill =
  "inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900 dark:hover:bg-emerald-950 dark:focus-visible:ring-offset-neutral-950";
const neutralPill =
  "inline-flex shrink-0 items-center rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700 dark:hover:bg-neutral-700 dark:focus-visible:ring-offset-neutral-950";

export default async function AutorisationsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Dernier état par source (vue current_consents). Scopé par user_id : le client
  // admin contourne la RLS, donc on filtre nous-mêmes, toujours.
  const { data: rows } = await supabaseAdmin()
    .from("current_consents")
    .select("source, granted")
    .eq("user_id", user.id);

  const state = new Map<string, boolean>();
  for (const r of rows ?? []) state.set(r.source, r.granted);

  return (
    <>
      <PageIntro eyebrow="Autorisations" title="Autorisations">
        Ton registre de consentement : ce que tu as autorisé, horodaté, et sur quoi tu peux changer d&apos;avis, ligne par ligne.
      </PageIntro>

      <div className="mb-6">
        <Bubble>
          Je te demande toujours ton code avant de toucher à tes données perso, quoi qu&apos;il arrive ici. Ce registre garde la trace de tes choix.
        </Bubble>
      </div>

      <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
        {CONSENTS.map(({ source, label, aide }) => {
          const granted = state.get(source) ?? false;
          const next = granted ? "false" : "true";
          return (
            <div key={source} className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink dark:text-neutral-100">{label}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{aide}</p>
              </div>
              <form action={toggleConsent}>
                <input type="hidden" name="source" value={source} />
                <input type="hidden" name="granted" value={next} />
                <button type="submit" className={granted ? grantedPill : neutralPill}>
                  {granted ? "Autorisé — révoquer" : "Refusé — autoriser"}
                </button>
              </form>
            </div>
          );
        })}
      </Card>

      <p className="mt-4 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">
        Chaque changement s&apos;ajoute au registre avec la date et l&apos;heure. Rien n&apos;est effacé : tu gardes l&apos;historique complet de tes choix.
      </p>
    </>
  );
}
