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

import { useState } from "react";
import { Language } from "@/lib/language";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LangSwitcher } from "../lang-switcher";
import { Button } from "@/components/button";
import { field, fieldLabel } from "@/components/styles";
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
      <h1 className="font-display text-4xl text-ink">{tr.title}</h1>
      <p className="mt-2 text-muted">{tr.subtitle}</p>

      {linkExpired && !sent && (
        <p className="mt-6 rounded-xl border border-line bg-cream-deep p-3 text-sm text-slate">
          <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn align-middle" aria-hidden />
          {tr.previousFailed}
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-xl border border-line bg-cream-deep p-3 text-sm text-slate">
          <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn align-middle" aria-hidden />
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
                <Button
                  key={id}
                  href={`/connexion/bientot?p=${id}`}
                  variant="ghost"
                  size="lg"
                  className="w-full"
                >
                  <span className="opacity-60">
                    <Icon />
                  </span>
                  {label}
                  <span className="rounded-full bg-clay-tint px-2 py-0.5 text-xs font-semibold text-ink">
                    {tr.comingSoonBadge}
                  </span>
                </Button>
              );
            }
            return (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => signInWith(id)}
                disabled={oauthBusy !== null}
                className="w-full"
              >
                <Icon />
                {oauthBusy === id ? tr.redirecting : label}
              </Button>
            );
          })}

          {!emailCode && (
            // Le code à 6 chiffres exige un SMTP custom + {{ .Token }} dans le
            // gabarit. Tant que ce n'est pas en place, on l'affiche « à fixer »,
            // comme les fournisseurs OAuth pas encore câblés. Le lien magique,
            // lui, part par le service e-mail par défaut : il fonctionne.
            <Button href="/connexion/bientot?p=code" variant="ghost" size="lg" className="w-full">
              {tr.codeSignIn}
              <span className="rounded-full bg-clay-tint px-2 py-0.5 text-xs font-semibold text-ink">
                {tr.comingSoonBadge}
              </span>
            </Button>
          )}
        </div>
      )}

      {(providers.length > 0 || !emailCode) && (
        <div className="my-8 flex items-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-sm text-muted">{tr.orByEmail}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      {sent ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-cream-deep p-5 text-slate">
            <p className="font-medium text-ink">
              <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ok align-middle" aria-hidden />
              {tr.sentTitle}
            </p>
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
                <span className={fieldLabel}>{tr.codeLabel}</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className={`${field} text-center text-2xl tracking-[0.5em]`}
                />
              </label>
              <Button type="submit" size="lg" disabled={verifying || code.length < 6} className="w-full">
                {verifying ? tr.verifying : tr.validateCode}
              </Button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
            className="text-sm text-muted underline-offset-2 transition-colors hover:text-clay hover:underline"
          >
            {tr.changeAddress}
          </button>
        </div>
      ) : (
        <form onSubmit={sendEmail} className="space-y-4">
          <label className="block">
            <span className={fieldLabel}>{tr.emailLabel}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr.emailPlaceholder}
              className={field}
            />
          </label>
          <Button type="submit" size="lg" disabled={sending} className="w-full">
            {sending ? tr.sending : emailCode ? tr.submitWithCode : tr.submitLinkOnly}
          </Button>
        </form>
      )}

      {/* Note SafeLinks : le lien magique est toujours proposé, donc on affiche
          toujours l'avertissement. On adapte le recours à ce qui existe vraiment
          (bouton OAuth actif > code à 6 chiffres > lien seul). */}
      <p className="mt-8 text-center text-sm text-muted">
        {hasLive
          ? tr.outlookNote.buttons
          : emailCode
            ? tr.outlookNote.code
            : tr.outlookNote.linkOnly}
      </p>
    </main>
  );
}
