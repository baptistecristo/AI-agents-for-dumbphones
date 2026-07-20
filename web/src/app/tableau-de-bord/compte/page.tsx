// Compte : les connexions reliées (lecture seule), Google (relier / détacher),
// l'export de tes données, et la porte de sortie (suppression du compte). Rien
// n'est irréversible ici, sauf la suppression — et celle-là est verrouillée
// derrière une phrase à recopier.

import { redirect } from "next/navigation";
import { siteLanguage } from "@/lib/site-i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { DASHBOARD } from "../copy";
import { fr } from "../format";
import { Bubble, Card, EmptyState, Hint, PageIntro, Section, primaryBtn, secondaryBtn } from "../ui";
import { disconnectGoogle } from "./actions";
import { DeleteAccount } from "./danger";

export const dynamic = "force-dynamic";

export default async function ComptePage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const db = supabaseAdmin();
  const [{ data: phones }, { data: google }] = await Promise.all([
    db
      .from("phones")
      .select("e164, label, verified_at")
      .eq("user_id", user.id)
      .not("verified_at", "is", null)
      .order("created_at", { ascending: true }),
    db.from("google_connections").select("google_email, scopes, connected_at").eq("user_id", user.id).maybeSingle(),
  ]);

  const confirmationError = (await searchParams).erreur === "confirmation";
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].compte;

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <Section
        title={tr.phones.title}
        description={tr.phones.description}
      >
        {phones && phones.length > 0 ? (
          <Card>
            <ul className="divide-y divide-line">
              {phones.map((p) => (
                <li key={p.e164} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="font-medium text-ink">{p.e164}</span>
                  <span className="text-sm text-muted">{p.label}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>{tr.phones.empty}</EmptyState>
        )}
        <Hint>{tr.phones.hint}</Hint>
      </Section>

      <Section
        title={tr.google.title}
        description={tr.google.description}
      >
        {google ? (
          <Card>
            <p className="text-ink">
              {tr.google.connectedWith}<span className="font-medium">{google.google_email}</span>
            </p>
            <p className="mt-1 text-sm text-muted">{tr.google.connectedSince.replace("%s", fr(google.connected_at, lang))}</p>
            <form action={disconnectGoogle} className="mt-4">
              <button className={secondaryBtn}>{tr.google.disconnect}</button>
            </form>
            <Hint>{tr.google.disconnectHint}</Hint>
          </Card>
        ) : (
          <Card>
            <p className="text-slate">{tr.google.notConnected}</p>
            <p className="mt-1 text-sm text-muted">
              {tr.google.notConnectedBody}
            </p>
            <a href="/api/oauth/google" className={`${primaryBtn} mt-4`}>
              {tr.google.connect}
            </a>
          </Card>
        )}
      </Section>

      <Section
        title={tr.export.title}
        description={tr.export.description}
      >
        <Card>
          <p className="text-slate">
            {tr.export.body}
          </p>
          <a href="/api/account/export" className={`${secondaryBtn} mt-4`}>
            {tr.export.download}
          </a>
          <div className="mt-4">
            <Bubble>{tr.export.bubble}</Bubble>
          </div>
        </Card>
      </Section>

      <Section
        title={tr.danger.title}
        description={tr.danger.description}
      >
        {confirmationError && (
          <p className="mb-4 rounded-control border border-danger/40 px-4 py-2.5 text-sm text-danger">
            {tr.danger.confirmError}
          </p>
        )}
        <Card>
          <DeleteAccount lang={lang} />
        </Card>
      </Section>
    </>
  );
}
