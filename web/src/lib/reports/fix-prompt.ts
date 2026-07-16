// Construit le prompt prêt à coller dans Claude Code pour combler un manque de
// capacité remonté pendant un appel. Gardé en CODE (pas généré par le LLM) pour
// que le format reste stable et pointe toujours les vrais fichiers du dépôt.

export type GapForPrompt = {
  request_summary: string;
  caller_words?: string | null;
  language?: string | null;
};

export function buildFixPrompt(gap: GapForPrompt): string {
  const heard = gap.caller_words?.trim()
    ? `\nWhat the caller actually said (context, may be in ${gap.language ?? "their language"}): "${gap.caller_words.trim()}"`
    : "";
  return `A caller asked the voice agent for something it can't do yet:

"${gap.request_summary.trim()}"${heard}

Add this as a new skill. Read CONTRIBUTING.md (the "Add a skill" section) first, then:
- implement the skill in web/src/lib/skills/ (one focused file),
- register it in the dispatcher web/src/lib/skills/index.ts,
- declare its tool schema in web/src/lib/agents/tools.ts,
- classify it in web/src/lib/skills/gate.ts ("free" unless it reads stored personal data or sends/spends),
- add a test in the web/src/lib/skills/*.test.ts style (vitest, no network).

Keep it capability-level and general — do not hard-code anything specific to one caller.`;
}
