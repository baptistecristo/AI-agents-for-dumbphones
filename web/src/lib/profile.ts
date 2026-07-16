// Per-caller agent instructions, read on the phone path.
//
// This is a SEPARATE, tolerant read on purpose. agent_instructions arrives in
// migration 0009; if the code ships before the migration is applied, folding
// this column into the main profile SELECT would fail the whole query and drop
// the call. So we read it on its own and swallow any error (missing column,
// transient failure) back to null — "no custom instructions", the safe default.
// One extra tiny query on the inbound path is a fair price for a call that never
// breaks on a schema it hasn't caught up with yet.

import { supabaseAdmin } from "./supabase/admin";

export async function agentInstructionsOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("profiles")
      .select("agent_instructions")
      .eq("id", userId)
      .single();
    if (error) return null;
    const value = (data as { agent_instructions?: string | null } | null)?.agent_instructions;
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}
