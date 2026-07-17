// Sélecteur de langue du site (FR / EN / ES). Server Component : trois boutons
// dans un formulaire vers la server action — fonctionne sans JavaScript, et la
// page revient déjà traduite. Le bouton cliqué porte name="lang" : sa valeur
// arrive dans le FormData (comportement HTML standard du "submitter").

import { Language } from "@/lib/language";
import { setSiteLanguage } from "@/lib/site-i18n-action";

const LABELS: Record<Language, string> = { fr: "FR", en: "EN", es: "ES" };

export function LangSwitcher({ current }: { current: Language }) {
  return (
    <form
      action={setSiteLanguage}
      aria-label="Langue du site / Site language / Idioma del sitio"
      className="flex overflow-hidden rounded-lg border border-ink/15 text-xs font-bold"
    >
      {(Object.keys(LABELS) as Language[]).map((l) => (
        <button
          key={l}
          name="lang"
          value={l}
          aria-pressed={current === l}
          className={`px-2.5 py-1.5 transition ${
            current === l ? "bg-bleu text-white" : "bg-white text-ink/60 hover:bg-bulle"
          }`}
        >
          {LABELS[l]}
        </button>
      ))}
    </form>
  );
}
