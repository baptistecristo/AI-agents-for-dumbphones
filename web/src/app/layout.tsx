import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { Language } from "@/lib/language";
import { siteLanguage } from "@/lib/site-i18n";
import { PublicSpeedInsights } from "@/components/speed-insights";
import "./globals.css";

// Corps : Hanken Grotesk — une grotesque nette et très lisible, dans l'esprit
// des sans neutres et chaleureuses. Pensée pour rester claire à petite taille,
// pour un public qui quitte l'écran, y compris en basse vision.
const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// Titres : Fraunces — un serif éditorial à fort caractère, réservé aux grands
// titres. L'optical sizing fait le gros du travail : posé, littéraire, calme.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

const META: Record<Language, { title: string; description: string }> = {
  fr: {
    title: `${brand} — l'assistant qu'on appelle, tout simplement`,
    description:
      "Tu as quitté le smartphone, garde le côté utile : appelle un numéro pour la météo, un itinéraire, un rappel, un SMS dicté ou une table réservée. Aucune application. Open-source.",
  },
  en: {
    title: `${brand} — the assistant you just call`,
    description:
      "You ditched the smartphone, keep the useful part: call a number for the weather, directions, a reminder, a dictated text or a booked table. No app. Open-source.",
  },
  es: {
    title: `${brand} — el asistente al que simplemente llamas`,
    description:
      "Dejaste el smartphone, quédate con lo útil: llama a un número para el tiempo, una ruta, un recordatorio, un SMS dictado o una mesa reservada. Sin aplicación. Open-source.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return META[await siteLanguage()];
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={await siteLanguage()} className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <PublicSpeedInsights />
      </body>
    </html>
  );
}
