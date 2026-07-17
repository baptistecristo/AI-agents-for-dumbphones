"use client";

// Navigation de l'espace personnel. Rail vertical sur grand écran, onglets qui
// défilent horizontalement sur mobile. L'onglet actif porte la marque jaune —
// le seul endroit où le jaune apparaît, pour qu'il veuille dire « tu es ici ».
// Composant client : la langue arrive en prop depuis le layout (serveur).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Language } from "@/lib/language";
import { DASHBOARD, DashboardCopy } from "./copy";

const LINKS: { href: string; key: keyof DashboardCopy["nav"]["labels"]; icon: string }[] = [
  { href: "/tableau-de-bord", key: "overview", icon: "👋" },
  { href: "/tableau-de-bord/agent", key: "agent", icon: "🎧" },
  { href: "/tableau-de-bord/memoire", key: "memory", icon: "💬" },
  { href: "/tableau-de-bord/autorisations", key: "permissions", icon: "🔒" },
  { href: "/tableau-de-bord/compte", key: "account", icon: "⚙️" },
];

export function PersonalAreaNav({ lang }: { lang: Language }) {
  const pathname = usePathname();
  const tr = DASHBOARD[lang].nav;
  return (
    <nav aria-label={tr.aria} className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
      {LINKS.map(({ href, key, icon }) => {
        // « Aperçu » est la racine : actif seulement si l'URL correspond exactement,
        // sinon il resterait allumé sur toutes les sous-pages.
        const active = href === "/tableau-de-bord" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu md:shrink ${
              active
                ? "bg-bulle font-bold text-bleu-fonce shadow-[inset_3px_0_0_0_var(--color-jaune)] dark:bg-bleu-fonce/40 dark:text-bulle"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }`}
          >
            <span aria-hidden className="text-base">{icon}</span>
            {tr.labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
