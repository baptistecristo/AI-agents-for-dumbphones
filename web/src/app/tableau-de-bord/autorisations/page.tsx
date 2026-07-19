// Autorisations : le registre de consentement. Pas un tableau de bord de
// capacités, un journal — ce que la personne a autorisé, horodaté, révocable
// ligne par ligne. Chaque bascule ajoute une ligne (table append-only) ; on ne
// promet donc pas ici qu'un « révoquer » coupe la fonction partout dans le
// système. Ce qu'on garantit, et qui est vrai, c'est la trace des choix.

import { redirect } from "next/navigation";
import { siteLanguage } from "@/lib/site-i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { CONSENT_SOURCES, DASHBOARD } from "../copy";
import { Bubble, Card, PageIntro } from "../ui";
import { toggleConsent } from "./actions";

export const dynamic = "force-dynamic";

// L'ordre d'affichage et les libellés (label + aide, sans surpromettre) vivent
// dans copy.ts : la clé `source` est ce que connaît la base (consents.source).

// Pastilles d'action. « Autorisé » en vert sobre (état franc, action = révoquer),
// « refusé » en neutre (action = autoriser). L'anneau de focus clay global s'applique.
const grantedPill =
  "inline-flex shrink-0 items-center rounded-full bg-ok/10 px-3.5 py-1.5 text-sm font-medium text-ok ring-1 ring-inset ring-ok/25 transition-colors hover:bg-ok/15";
const neutralPill =
  "inline-flex shrink-0 items-center rounded-full bg-cream-deep px-3.5 py-1.5 text-sm font-medium text-muted ring-1 ring-inset ring-line transition-colors hover:bg-line/60";

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

  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].autorisations;

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <div className="mb-6">
        <Bubble>{tr.bubble}</Bubble>
      </div>

      <Card className="divide-y divide-line !p-0">
        {CONSENT_SOURCES.map((source) => {
          const granted = state.get(source) ?? false;
          const next = granted ? "false" : "true";
          return (
            <div key={source} className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{tr.consents[source].label}</p>
                <p className="text-sm text-muted">{tr.consents[source].help}</p>
              </div>
              <form action={toggleConsent}>
                <input type="hidden" name="source" value={source} />
                <input type="hidden" name="granted" value={next} />
                <button type="submit" className={granted ? grantedPill : neutralPill}>
                  {granted ? tr.grantedAction : tr.refusedAction}
                </button>
              </form>
            </div>
          );
        })}
      </Card>

      <p className="mt-4 max-w-prose text-sm text-muted">
        {tr.footer}
      </p>
    </>
  );
}
