"use client";

// Formulaire de connexion / inscription. Cinq portes d'entrée, une seule page :
//   • OAuth Google / Apple / Microsoft / GitHub (boutons pilotés par la config,
//     cf. providers.tsx) ;
//   • lien magique par e-mail ;
//   • code à 6 chiffres par e-mail — le repli qui marche partout, même quand un
//     antivirus de messagerie (Outlook SafeLinks…) « pré-ouvre » et brûle le lien
//     magique avant l'utilisateur.
//
// Le même envoi d'e-mail contient le lien ET le code : la personne clique ou
// saisit, à son gré. Le code ne dépend d'aucune allowlist de redirection, donc
// il fonctionne dès que le gabarit e-mail expose {{ .Token }}.

import Link from "next/link";
import { useState } from "react";
import { Language } from "@/lib/language";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LangSwitcher } from "../lang-switcher";
import { CONNEXION } from "./copy";
import { displayedProviders, PROVIDERS, type OAuthId } from "./providers";

const NEXT = "/onboarding";

export function ConnexionForm({ linkExpired, lang }: { linkExpired: boolean; lang: Language }) {
  const tr = CONNEXION[lang];
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthId | null>(null);

  const providers = displayedProviders();
  const hasLive = providers.some((p) => p.status === "live");
  // Le code à 6 chiffres n'existe que si le gabarit e-mail expose {{ .Token }},
  // ce qui exige un SMTP custom. Sans ça, l'e-mail ne contient qu'un lien :
  // on masque le champ code pour ne pas réclamer un code qui n'arrive jamais.
  const emailCode = process.env.NEXT_PUBLIC_EMAIL_CODE === "true";

  async function signInWith(id: OAuthId) {
    setError(null);
    setOauthBusy(id);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: PROVIDERS[id].provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${NEXT}` },
    });
    // En cas de succès, la page est déjà redirigée vers le fournisseur.
    if (error) {
      setOauthBusy(null);
      setError(tr.oauthStartFailed);
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${NEXT}`,
        shouldCreateUser: true,
      },
    });
    setSending(false);
    if (error) setError(tr.sendFailed);
    else setSent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setVerifying(false);
      setError(tr.wrongCode);
      return;
    }
    // Session posée : rechargement complet pour que le serveur voie le cookie.
    window.location.href = NEXT;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-6 self-start">
        <LangSwitcher current={lang} />
      </div>
      <h1 className="font-display text-4xl tracking-tight text-ink dark:text-neutral-50">{tr.title}</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{tr.subtitle}</p>

      {linkExpired && !sent && (
        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {tr.previousFailed}
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {(providers.length > 0 || !emailCode) && (
        <div className="mt-8 space-y-3">
          {providers.map(({ id, status }) => {
            const { name, Icon } = PROVIDERS[id];
            const label = tr.continueWith.replace("%s", name);
            if (status === "soon") {
              // Bouton visible mais pas encore câblé : on renvoie vers une page
              // d'attente plutôt que de lancer une connexion qui échouerait.
              return (
                <Link
                  key={id}
                  href={`/connexion/bientot?p=${id}`}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-base font-semibold text-neutral-500 shadow-sm transition hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900/50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  <span className="opacity-60">
                    <Icon />
                  </span>
                  {label}
                  <span className="rounded-full bg-jaune/25 px-2 py-0.5 text-xs font-bold text-bleu dark:text-jaune">
                    {tr.comingSoonBadge}
                  </span>
                </Link>
              );
            }
            return (
              <button
                key={id}
                type="button"
                onClick={() => signInWith(id)}
                disabled={oauthBusy !== null}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-base font-semibold text-ink shadow-sm transition hover:bg-neutral-50 disabled:opacity-50 dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                <Icon />
                {oauthBusy === id ? tr.redirecting : label}
              </button>
            );
          })}

          {!emailCode && (
            // Le code à 6 chiffres exige un SMTP custom + {{ .Token }} dans le
            // gabarit. Tant que ce n'est pas en place, on l'affiche « à fixer »,
            // comme les fournisseurs OAuth pas encore câblés. Le lien magique,
            // lui, part par le service e-mail par défaut : il fonctionne.
            <Link
              href="/connexion/bientot?p=code"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-base font-semibold text-neutral-500 shadow-sm transition hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900/50 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <span className="opacity-60" aria-hidden="true">
                🔢
              </span>
              {tr.codeSignIn}
              <span className="rounded-full bg-jaune/25 px-2 py-0.5 text-xs font-bold text-bleu dark:text-jaune">
                {tr.comingSoonBadge}
              </span>
            </Link>
          )}
        </div>
      )}

      {(providers.length > 0 || !emailCode) && (
        <div className="my-8 flex items-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          <span className="text-sm text-neutral-500">{tr.orByEmail}</span>
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        </div>
      )}

      {sent ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <p className="font-bold">{tr.sentTitle}</p>
            <p className="mt-1 text-sm">
              {emailCode ? (
                <>
                  {tr.sentCodeBefore}<strong>{email}</strong>{tr.sentCodeAfter}
                </>
              ) : (
                <>
                  {tr.sentLinkBefore}<strong>{email}</strong>{tr.sentLinkAfter}
                </>
              )}
            </p>
          </div>

          {emailCode && (
            <form onSubmit={verifyCode} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{tr.codeLabel}</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-bleu dark:border-white/20 dark:bg-neutral-900 dark:focus:border-bulle"
                />
              </label>
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="w-full rounded-xl bg-bleu px-4 py-3 text-base font-bold text-white transition hover:bg-bleu-fonce disabled:opacity-50"
              >
                {verifying ? tr.verifying : tr.validateCode}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
            className="text-sm text-neutral-500 underline-offset-2 hover:underline"
          >
            {tr.changeAddress}
          </button>
        </div>
      ) : (
        <form onSubmit={sendEmail} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{tr.emailLabel}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr.emailPlaceholder}
              className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-lg outline-none focus:border-bleu dark:border-white/20 dark:bg-neutral-900 dark:focus:border-bulle"
            />
          </label>
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-xl bg-bleu px-4 py-3 text-base font-bold text-white transition hover:bg-bleu-fonce disabled:opacity-50"
          >
            {sending ? tr.sending : emailCode ? tr.submitWithCode : tr.submitLinkOnly}
          </button>
        </form>
      )}

      {/* Note SafeLinks : le lien magique est toujours proposé, donc on affiche
          toujours l'avertissement. On adapte le recours à ce qui existe vraiment
          (bouton OAuth actif > code à 6 chiffres > lien seul). */}
      <p className="mt-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {hasLive
          ? tr.outlookNote.buttons
          : emailCode
            ? tr.outlookNote.code
            : tr.outlookNote.linkOnly}
      </p>
    </main>
  );
}
