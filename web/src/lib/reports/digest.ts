// Un manque de capacité = un bloc ; tous les manques en attente = UN e-mail par
// jour. Chaque bloc porte son prompt de correction prêt à coller (fix-prompt.ts).

import { buildFixPrompt } from "./fix-prompt";

export type GapRow = {
  id: string;
  created_at: string;
  request_summary: string;
  caller_words: string | null;
  language: string | null;
  notify_caller: boolean;
};

export function buildDigestEmail(gaps: GapRow[]): { subject: string; text: string } {
  const n = gaps.length;
  const s = n === 1 ? "" : "s";
  const subject = `${n} capability gap${s} from your voice agent`;
  const blocks = gaps.map((g, i) => {
    const waiting = g.notify_caller ? "\n↩ a caller is waiting for an SMS when this ships" : "";
    return `── Gap ${i + 1} of ${n} · ${g.created_at}${waiting}\n\nPrompt to fix it (paste into Claude Code):\n\n${buildFixPrompt(g)}`;
  });
  const text = `Your voice agent was asked for ${n} thing${s} it can't do yet.\n\n${blocks.join("\n\n\n")}\n`;
  return { subject, text };
}
