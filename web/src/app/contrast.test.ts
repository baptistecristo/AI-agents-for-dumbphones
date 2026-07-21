// Le contraste de la charte, vérifié sur globals.css lui-même.
//
// Ce test lit le fichier plutôt que de recopier les valeurs : une table
// recopiée finit par mentir, et c'est précisément ce qui était arrivé (la doc
// annonçait des ratios que la palette ne tenait plus). Repeindre une primitive
// et casser un contraste échoue donc ici, pas en revue.
//
// Formule WCAG 2.x : luminance relative sRGB, décalage de 0,05.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Résout une variable jusqu'à sa valeur brute, en suivant les `var(--x)`. */
function token(name: string, depth = 0): string {
  if (depth > 5) throw new Error(`Chaîne de var() trop longue pour --${name}`);
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Jeton introuvable dans globals.css : --${name}`);
  const value = match[1].trim();
  const indirect = value.match(/^var\(--([\w-]+)\)$/);
  return indirect ? token(indirect[1], depth + 1) : value;
}

const channels = (hex: string): number[] => {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Pas un hex à 6 chiffres : ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (fg: string, bg: string): number => {
  const [light, dark] = [luminance(token(fg)), luminance(token(bg))].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

// Les fonds sur lesquels du texte se pose réellement.
const BACKDROPS = ["cream", "surface", "cream-deep"];

describe("contraste de la charte", () => {
  // 4.5:1, le seuil AA du texte courant. Le site écrit presque tout en
  // `text-sm`, donc l'exemption « grand texte » (3:1) ne s'applique nulle part.
  it.each(["ink", "slate", "muted", "clay", "ok", "warn", "danger"])(
    "%s tient AA sur chaque fond de page",
    (role) => {
      for (const backdrop of BACKDROPS) {
        expect(contrast(role, backdrop), `${role} sur ${backdrop}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // `bg-clay-tint` porte du texte, contrairement à `bg-clay` qui ne sert qu'à
  // des pastilles décoratives. Les deux couleurs qu'on y pose doivent tenir.
  it.each(["clay", "ink"])("%s tient AA sur le lavis d'argile", (role) => {
    expect(contrast(role, "clay-tint")).toBeGreaterThanOrEqual(4.5);
  });

  // WCAG 1.4.11 : 3:1 pour ce qui identifie un contrôle. La bordure d'un champ
  // est la seule chose qui dit où il commence.
  it("la bordure d'un contrôle tient 3:1", () => {
    for (const backdrop of BACKDROPS) {
      expect(contrast("line-strong", backdrop), `line-strong sur ${backdrop}`).toBeGreaterThanOrEqual(3);
    }
  });

  // L'anneau de focus, même exigence, même raison.
  it("l'anneau de focus tient 3:1", () => {
    for (const backdrop of BACKDROPS) {
      expect(contrast("clay", backdrop)).toBeGreaterThanOrEqual(3);
    }
  });

  // `line` reste volontairement discret : il sépare deux cartes, il n'identifie
  // aucun contrôle. Ce test dit que ce choix est délibéré, et surtout que
  // personne ne l'a recyclé en bordure de champ en croyant bien faire.
  it("line reste un filet décoratif, distinct de line-strong", () => {
    expect(contrast("line", "cream")).toBeLessThan(3);
    expect(token("line")).not.toBe(token("line-strong"));
  });
});
