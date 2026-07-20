"use client";

// Étapes interactives de l'onboarding (composants client).

import { useActionState } from "react";
import { Language } from "@/lib/language";
import { confirmOtp, sendOtp, skipPhone } from "./actions";
import { ONBOARDING } from "./copy";
import { Button } from "@/components/button";
import { field, fieldLabel } from "@/components/styles";

export function PhoneStep({ lang }: { lang: Language }) {
  const tr = ONBOARDING[lang].phone;
  const [sendState, sendAction, sending] = useActionState(sendOtp, null);
  const [confirmState, confirmAction, confirming] = useActionState(confirmOtp, null);

  return (
    <section>
      <h1 className="font-display text-2xl text-ink">{tr.title}</h1>
      <p className="mt-2 text-slate">{tr.body}</p>

      {!sendState?.ok ? (
        <form action={sendAction} className="mt-8 space-y-4">
          <label className="block">
            <span className={fieldLabel}>{tr.fullName}</span>
            <input name="full_name" placeholder="Sam Riviere" className={field} />
          </label>
          <label className="block">
            <span className={fieldLabel}>{tr.preferredName}</span>
            <input name="preferred_name" placeholder="Sam" className={field} />
          </label>
          <label className="block">
            <span className={fieldLabel}>{tr.address}</span>
            <input name="home_address" placeholder={tr.addressPlaceholder} className={field} />
          </label>
          <label className="block">
            <span className={fieldLabel}>{tr.phoneLabel}</span>
            <input
              name="phone"
              required
              placeholder={tr.phonePlaceholder}
              inputMode="tel"
              className={`${field} text-lg`}
            />
          </label>
          {sendState && !sendState.ok && <p className="text-sm text-warn">{sendState.message}</p>}
          <Button type="submit" size="lg" disabled={sending} className="w-full">
            {sending ? tr.sending : tr.sendCode}
          </Button>
          <Button variant="ghost" size="lg" formAction={skipPhone} formNoValidate className="w-full">
            {tr.skip}
          </Button>
        </form>
      ) : (
        <form action={confirmAction} className="mt-8 space-y-4">
          <input type="hidden" name="e164" value={sendState.e164} />
          <p className="rounded-control border-l-2 border-ok bg-cream-deep p-3 text-sm text-ink">
            {tr.codeSentTo.replace("%s", sendState.e164 ?? "")}
          </p>
          <label className="block">
            <span className={fieldLabel}>{tr.codeLabel}</span>
            <input
              name="code"
              required
              inputMode="numeric"
              maxLength={8}
              placeholder="123456"
              className={`${field} text-center text-2xl tracking-widest`}
            />
          </label>
          {confirmState && !confirmState.ok && <p className="text-sm text-warn">{confirmState.message}</p>}
          <Button type="submit" size="lg" disabled={confirming} className="w-full">
            {confirming ? tr.verifying : tr.verify}
          </Button>
          {confirmState?.ok && (
            <a
              href="/onboarding"
              className="block text-center text-sm font-medium text-clay transition-colors hover:text-clay/80"
            >
              {tr.continue}
            </a>
          )}
        </form>
      )}
    </section>
  );
}
