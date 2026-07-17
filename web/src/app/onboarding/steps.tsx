"use client";

// Étapes interactives de l'onboarding (composants client).

import { useActionState } from "react";
import { Language } from "@/lib/language";
import { confirmOtp, sendOtp, skipPhone } from "./actions";
import { ONBOARDING } from "./copy";

export function PhoneStep({ lang }: { lang: Language }) {
  const tr = ONBOARDING[lang].phone;
  const [sendState, sendAction, sending] = useActionState(sendOtp, null);
  const [confirmState, confirmAction, confirming] = useActionState(confirmOtp, null);

  return (
    <section>
      <h1 className="text-2xl font-semibold">{tr.title}</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{tr.body}</p>

      {!sendState?.ok ? (
        <form action={sendAction} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{tr.fullName}</span>
            <input name="full_name" placeholder="Sam Riviere" className="w-full rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{tr.preferredName}</span>
            <input name="preferred_name" placeholder="Sam" className="w-full rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{tr.address}</span>
            <input name="home_address" placeholder={tr.addressPlaceholder} className="w-full rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{tr.phoneLabel}</span>
            <input
              name="phone"
              required
              placeholder={tr.phonePlaceholder}
              inputMode="tel"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          {sendState && !sendState.ok && <p className="text-sm text-red-600">{sendState.message}</p>}
          <button
            disabled={sending}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-lg font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {sending ? tr.sending : tr.sendCode}
          </button>
          <button
            formAction={skipPhone}
            formNoValidate
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            {tr.skip}
          </button>
        </form>
      ) : (
        <form action={confirmAction} className="mt-8 space-y-4">
          <input type="hidden" name="e164" value={sendState.e164} />
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {tr.codeSentTo.replace("%s", sendState.e164 ?? "")}
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{tr.codeLabel}</span>
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
            {confirming ? tr.verifying : tr.verify}
          </button>
          {confirmState?.ok && (
            <a href="/onboarding" className="block text-center text-sm underline">
              {tr.continue}
            </a>
          )}
        </form>
      )}
    </section>
  );
}
