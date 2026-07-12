import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Young_Serif } from "next/font/google";
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

export const metadata: Metadata = {
  title: `${brand} — l'assistant qu'on appelle, tout simplement`,
  description:
    "Un assistant vocal au bout du fil pour ceux qui préfèrent un téléphone simple : agenda, rappels, itinéraires, et des appels passés à leur place. Aucune application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
