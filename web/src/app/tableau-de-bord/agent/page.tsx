// Mon agent : tout ce qui change la façon dont il décroche et te parle. Chaque
// réglage est adossé à du vrai comportement — le prénom et les consignes partent
// dans le prompt, la langue choisit la voix et la transcription, le débit règle
// ElevenLabs, l'adresse sert les itinéraires « depuis chez moi ».

import { redirect } from "next/navigation";
import { normalizeLanguage } from "@/lib/language";
import { agentInstructionsOf } from "@/lib/profile";
import { siteLanguage } from "@/lib/site-i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { userHasTextPin } from "@/lib/text-pin";
import { DASHBOARD } from "../copy";
import { VOICE_SPEED_CHOICES, nearestVoiceSpeed } from "../format";
import { Bubble, Card, Hint, PageIntro, fieldLabel, inputCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from "../ui";
import { updatePersonalization, updateTextPin } from "./actions";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ enregistre?: string; pin?: string }> }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Les colonnes stables et les consignes sont lues séparément : agent_instructions
  // arrive avec 0009, et agentInstructionsOf() tolère son absence. La page reste
  // donc correcte que la migration soit appliquée ou non.
  // hasPin est lu à part et tolérant : la colonne arrive avec 0011, et
  // userHasTextPin() retombe sur false si elle manque — la page reste correcte
  // que la migration soit appliquée ou non (même logique que agent_instructions).
  const [{ data: profile }, agentInstructions, hasPin] = await Promise.all([
    supabaseAdmin()
      .from("profiles")
      .select("preferred_name, full_name, home_address, preferred_language, voice_speed")
      .eq("id", user.id)
      .single(),
    agentInstructionsOf(user.id),
    userHasTextPin(user.id),
  ]);

  const sp = await searchParams;
  const saved = sp.enregistre === "1";
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].agent;

  const pinNotice =
    sp.pin === "1"
      ? { text: tr.pin.saved, ok: true }
      : sp.pin === "cleared"
        ? { text: tr.pin.cleared, ok: true }
        : sp.pin === "format"
          ? { text: tr.pin.badFormat, ok: false }
          : sp.pin === "err"
            ? { text: tr.pin.error, ok: false }
            : null;

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      {saved && (
        <p className="mb-6 flex items-center rounded-control border border-ok/30 bg-ok/5 px-4 py-2.5 text-sm text-ok">
          <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ok align-middle" aria-hidden />
          {tr.saved}
        </p>
      )}

      <Card>
        <form action={updatePersonalization} className="space-y-6">
          <label className="block">
            {fieldLabel(tr.preferredName.label)}
            <input name="preferred_name" defaultValue={profile?.preferred_name ?? ""} placeholder={tr.preferredName.placeholder} className={inputCls} />
            <Hint>{tr.preferredName.hint}</Hint>
          </label>

          <label className="block">
            {fieldLabel(tr.fullName.label)}
            <input name="full_name" defaultValue={profile?.full_name ?? ""} placeholder={tr.fullName.placeholder} className={inputCls} />
            <Hint>{tr.fullName.hint}</Hint>
          </label>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              {fieldLabel(tr.language.label)}
              {/* Chaque option se lit dans sa propre langue, quelle que soit la langue du site. */}
              <select name="preferred_language" defaultValue={normalizeLanguage(profile?.preferred_language)} className={selectCls}>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
              <Hint>{tr.language.hint}</Hint>
            </label>

            <label className="block">
              {fieldLabel(tr.speed.label)}
              <select name="voice_speed" defaultValue={nearestVoiceSpeed(profile?.voice_speed)} className={selectCls}>
                {VOICE_SPEED_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.labels[lang]}
                  </option>
                ))}
              </select>
              <Hint>{tr.speed.hint}</Hint>
            </label>
          </div>

          <label className="block">
            {fieldLabel(tr.homeAddress.label)}
            <input name="home_address" defaultValue={profile?.home_address ?? ""} placeholder={tr.homeAddress.placeholder} className={inputCls} />
            <Hint>{tr.homeAddress.hint}</Hint>
          </label>

          <div className="border-t border-line pt-6">
            <label className="block">
              {fieldLabel(tr.instructions.label)}
              <textarea
                name="agent_instructions"
                defaultValue={agentInstructions ?? ""}
                maxLength={600}
                rows={4}
                placeholder={tr.instructions.placeholder}
                className={textareaCls}
              />
              <Hint>{tr.instructions.hint}</Hint>
            </label>
            <div className="mt-3">
              <Bubble>{tr.bubble}</Bubble>
            </div>
          </div>

          <button className={primaryBtn}>{tr.save}</button>
        </form>
      </Card>

      {pinNotice && (
        <p
          className={`mt-6 flex items-center rounded-control border px-4 py-2.5 text-sm ${
            pinNotice.ok ? "border-ok/30 bg-ok/5 text-ok" : "border-danger/30 bg-danger/5 text-danger"
          }`}
        >
          <span
            className={`mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle ${pinNotice.ok ? "bg-ok" : "bg-danger"}`}
            aria-hidden
          />
          {pinNotice.text}
        </p>
      )}

      <Card className="mt-6">
        <form action={updateTextPin} className="space-y-4">
          <label className="block">
            {fieldLabel(tr.pin.label)}
            <input
              name="text_pin"
              inputMode="numeric"
              pattern="\d{3}"
              maxLength={3}
              autoComplete="off"
              placeholder="•••"
              className={inputCls}
            />
            <Hint>{tr.pin.hint}</Hint>
          </label>
          <p className="text-sm text-muted">{hasPin ? tr.pin.set : tr.pin.unset}</p>
          <div className="flex flex-wrap gap-3">
            <button className={primaryBtn}>{tr.pin.save}</button>
            {hasPin && (
              <button name="action" value="clear" className={secondaryBtn}>
                {tr.pin.remove}
              </button>
            )}
          </div>
        </form>
      </Card>
    </>
  );
}
