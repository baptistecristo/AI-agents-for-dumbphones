// Envoi d'e-mail transactionnel (Resend). Comme twilio.ts : un fournisseur = un
// fichier ; changer de fournisseur = réécrire ce seul module. Pas de dépendance
// npm — un POST HTTPS suffit. RESEND_API_KEY est fourni par l'intégration
// Vercel × Resend ; REPORT_EMAIL_FROM / REPORT_EMAIL_TO se règlent à la main.

import { env } from "./env";

// Y a-t-il un fournisseur e-mail branché ? On lit process.env directement (pas
// env(), qui lève) : ce prédicat sert justement à décider avant de lever.
export function emailProviderConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.REPORT_EMAIL_FROM && process.env.REPORT_EMAIL_TO);
}

export async function sendEmail(opts: { subject: string; text: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env("REPORT_EMAIL_FROM"),
      to: env("REPORT_EMAIL_TO"),
      subject: opts.subject,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
}
