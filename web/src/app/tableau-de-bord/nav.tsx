"use client";

// Navigation de l'espace personnel. Rail vertical sur grand écran, onglets qui
// défilent horizontalement sur mobile. L'onglet actif porte l'argile — le seul
// endroit où l'accent apparaît dans le rail, pour qu'il veuille dire « tu es ici ».
// Composant client : la langue arrive en prop depuis le layout (serveur).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Language } from "@/lib/language";
import { DASHBOARD, DashboardCopy } from "./copy";

const LINKS: { path: string; key: keyof DashboardCopy["nav"]["labels"] }[] = [
  { path: "", key: "overview" },
  { path: "/agent", key: "agent" },
  { path: "/memoire", key: "memory" },
  { path: "/autorisations", key: "permissions" },
  { path: "/compte", key: "account" },
];

// Le même rail sert l'espace personnel et la démo : seul le préfixe change.
export function PersonalAreaNav({ lang, basePath = "/tableau-de-bord" }: { lang: Language; basePath?: string }) {
  const pathname = usePathname();
  const tr = DASHBOARD[lang].nav;
  return (
    <nav aria-label={tr.aria} className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
      {LINKS.map(({ path, key }) => {
        const href = `${basePath}${path}`;
        // « Aperçu » est la racine : actif seulement si l'URL correspond exactement,
        // sinon il resterait allumé sur toutes les sous-pages.
        const active = path === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center rounded-control px-3 py-2 text-sm transition-colors md:shrink ${
              active
                ? "bg-clay-tint font-medium text-clay"
                : "text-muted hover:bg-cream-deep hover:text-ink"
            }`}
          >
            {tr.labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
