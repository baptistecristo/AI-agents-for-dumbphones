"use client";

// Étapes interactives de l'onboarding (composants client).

import { useActionState, useState } from "react";
import { confirmOtp, saveIdentity, sendOtp } from "./actions";

export function PhoneStep() {
  const [sendState, sendAction, sending] = useActionState(sendOtp, null);
  const [confirmState, confirmAction, confirming] = useActionState(confirmOtp, null);
  const [identitySaved, setIdentitySaved] = useState(false);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Le téléphone à relier</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        C&apos;est le numéro depuis lequel tu appelleras ton assistant. Un code de vérification
        arrive par SMS.
      </p>

      <form
        action={(fd) => {
          saveIdentity(fd);
          setIdentitySaved(true);
        }}
        className="mt-8 space-y-4"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nom complet</span>
          <input name="full_name" placeholder="Sam Riviere" className="w-full rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Comment l&apos;assistant doit t&apos;appeler</span>
          <input name="preferred_name" placeholder="Sam" className="w-full rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Ton adresse (pour les itinéraires depuis « chez moi »)</span>
          <input name="home_address" placeholder="12 rue des Lilas, 75011 Paris" className="w-full rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
        </label>
        <button className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
          {identitySaved ? "Enregistré ✅" : "Enregistrer ces informations"}
        </button>
      </form>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      {!sendState?.ok ? (
        <form action={sendAction} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Numéro du téléphone (le dumbphone)</span>
            <input
              name="phone"
              required
              placeholder="06 12 34 56 78"
              inputMode="tel"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          {sendState && !sendState.ok && <p className="text-sm text-red-600">{sendState.message}</p>}
          <button
            disabled={sending}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-lg font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {sending ? "Envoi…" : "Envoyer le code de vérification"}
          </button>
        </form>
      ) : (
        <form action={confirmAction} className="space-y-4">
          <input type="hidden" name="e164" value={sendState.e164} />
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Code envoyé au {sendState.e164}. Saisis-le ci-dessous.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Code reçu par SMS</span>
            <input
              name="code"
              required
              inputMode="numeric"
              maxLength={8}
              placeholder="123456"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-center text-2xl tracking-widest dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          {confirmState && !confirmState.ok && <p className="text-sm text-red-600">{confirmState.message}</p>}
          <button
            disabled={confirming}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-lg font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {confirming ? "Vérification…" : "Vérifier"}
          </button>
          {confirmState?.ok && (
            <a href="/onboarding" className="block text-center text-sm underline">
              Continuer →
            </a>
          )}
        </form>
      )}
    </section>
  );
}
