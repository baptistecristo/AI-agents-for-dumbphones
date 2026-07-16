// Compte : les connexions reliées (lecture seule), Google (relier / détacher),
// l'export de tes données, et la porte de sortie (suppression du compte). Rien
// n'est irréversible ici, sauf la suppression — et celle-là est verrouillée
// derrière une phrase à recopier.

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
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

  return (
    <>
      <PageIntro eyebrow="Compte" title="Compte">
        Tes connexions, tes données, et la porte de sortie si un jour tu veux partir.
      </PageIntro>

      <Section
        title="Téléphones reliés"
        description="Les numéros depuis lesquels tu appelles ton agent. C'est à ton numéro qu'il te reconnaît."
      >
        {phones && phones.length > 0 ? (
          <Card>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {phones.map((p) => (
                <li key={p.e164} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="font-medium text-ink dark:text-neutral-100">{p.e164}</span>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">{p.label}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>Aucun numéro relié pour l&apos;instant.</EmptyState>
        )}
        <Hint>
          Pour relier un autre numéro, ça se passe à la mise en route, ou avec le support : il faut le vérifier par SMS.
        </Hint>
      </Section>

      <Section
        title="Google"
        description="Ton agenda et tes contacts, pour que l'agent lise tes rendez-vous et appelle les bonnes personnes."
      >
        {google ? (
          <Card>
            <p className="text-ink dark:text-neutral-100">
              Connecté avec <span className="font-medium">{google.google_email}</span>
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Relié depuis le {fr(google.connected_at)}.</p>
            <form action={disconnectGoogle} className="mt-4">
              <button className={secondaryBtn}>Déconnecter Google</button>
            </form>
            <Hint>
              En te déconnectant, l&apos;agenda et les contacts s&apos;arrêtent jusqu&apos;à une nouvelle connexion. Le reste
              de ton compte ne bouge pas.
            </Hint>
          </Card>
        ) : (
          <Card>
            <p className="text-neutral-600 dark:text-neutral-400">Google n&apos;est pas connecté.</p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Sans lui, l&apos;agent ne peut ni lire ton agenda ni retrouver tes contacts.
            </p>
            <a href="/api/oauth/google" className={`${primaryBtn} mt-4`}>
              Connecter Google
            </a>
          </Card>
        )}
      </Section>

      <Section
        title="Exporter mes données"
        description="Tout ce que l'agent sait de toi, dans un fichier. Les jetons chiffrés n'y sont pas."
      >
        <Card>
          <p className="text-neutral-600 dark:text-neutral-400">
            Un fichier JSON : ton profil, tes numéros, tes rappels, tes notes, et ton historique d&apos;appels et de SMS.
            Il se télécharge tout de suite, et il est à toi.
          </p>
          <a href="/api/account/export" className={`${secondaryBtn} mt-4`}>
            Télécharger mes données
          </a>
          <div className="mt-4">
            <Bubble>
              Ce fichier, c&apos;est tout ce que je garde de toi. Mes accès chiffrés n&apos;y sont pas : ils me servent à
              agir, pas à être lus.
            </Bubble>
          </div>
        </Card>
      </Section>

      <Section
        title="Supprimer mon compte"
        description="Ton droit à l'effacement. Ce que tu supprimes ici part définitivement."
      >
        {confirmationError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            La phrase de confirmation ne correspondait pas. Rien n&apos;a été supprimé.
          </p>
        )}
        <Card>
          <DeleteAccount />
        </Card>
      </Section>
    </>
  );
}
