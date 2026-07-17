import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Young_Serif } from "next/font/google";
import { Language } from "@/lib/language";
import { siteLanguage } from "@/lib/site-i18n";
import "./globals.css";

// Corps : Atkinson Hyperlegible — police conçue pour la basse vision
// (Braille Institute). L'accessibilité est le produit, jusque dans la lettre.
const body = Atkinson_Hyperlegible({
  variable: "--font-body",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const display = Young_Serif({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
