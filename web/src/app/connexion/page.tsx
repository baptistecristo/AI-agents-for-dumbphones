"use client";

// Connexion / inscription par lien magique (e-mail). Pensé pour être fait par
// un proche (« la famille qui achète ») autant que par l'utilisateur final.

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ConnexionPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding` },
    });
    setLoading(false);
    if (error) setError("L'envoi a échoué. Vérifiez l'adresse et réessayez.");
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Se connecter</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Recevez un lien de connexion par e-mail. Pas de mot de passe à retenir.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <p className="font-medium">C'est envoyé 📬</p>
          <p className="mt-1 text-sm">
            Ouvrez l'e-mail reçu à <strong>{email}</strong> et cliquez sur le lien pour continuer.
          </p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Adresse e-mail</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@exemple.fr"
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-lg outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-lg font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {loading ? "Envoi…" : "Recevoir mon lien de connexion"}
          </button>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-neutral-500">
        Première visite ? Le lien crée votre compte automatiquement.
      </p>
    </main>
  );
}
