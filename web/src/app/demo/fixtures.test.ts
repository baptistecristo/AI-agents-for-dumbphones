// Les fixtures de la démo doivent respecter ce que les pages attendent des
// vraies requêtes : appels triés du plus récent au plus ancien, rappels à venir
// triés par échéance, notes par clé. Un jeu de données incohérent raconterait
// une démo cassée — c'est exactement ce que ces tests empêchent.

import { describe, expect, it } from "vitest";
import type { Language } from "@/lib/language";
import { demoData } from "./fixtures";

const NOW = new Date("2026-08-08T12:00:00Z");
const LANGUAGES: Language[] = ["fr", "en", "es"];

describe("demoData", () => {
  for (const lang of LANGUAGES) {
    describe(lang, () => {
      const data = demoData(lang, NOW);

      it("place tous les appels dans le passé, du plus récent au plus ancien", () => {
        const times = data.calls.map((c) => new Date(c.started_at).getTime());
        for (const t of times) {
          expect(Number.isNaN(t)).toBe(false);
          expect(t).toBeLessThan(NOW.getTime());
        }
        expect(times).toEqual([...times].sort((a, b) => b - a));
      });

      it("place tous les rappels dans le futur, par échéance croissante", () => {
        const times = data.reminders.map((r) => new Date(r.due_at).getTime());
        for (const t of times) {
          expect(Number.isNaN(t)).toBe(false);
          expect(t).toBeGreaterThan(NOW.getTime());
        }
        expect(times).toEqual([...times].sort((a, b) => a - b));
      });

      it("trie les notes par clé, comme la requête réelle", () => {
        const keys = data.notes.map((n) => n.key);
        expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b, lang)));
      });

      it("déclare le numéro relié comme sujet du consentement par numéro", () => {
        expect(data.trustedCallers.map((t) => t.subject)).toContain(data.phone.e164);
      });

      it("parle la langue du site", () => {
        expect(data.profile.preferred_language).toBe(lang);
      });
    });
  }
});
