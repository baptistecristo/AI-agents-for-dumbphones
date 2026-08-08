// Mon agent, version démo : les mêmes champs que la vraie page, remplis avec le
// profil de Sam et désactivés. Pas de <form> : rien à soumettre, la mention
// sous le bouton dit où ces réglages prendront vie.

import { siteLanguage } from "@/lib/site-i18n";
import { DASHBOARD } from "../../tableau-de-bord/copy";
import { VOICE_SPEED_CHOICES, nearestVoiceSpeed } from "../../tableau-de-bord/format";
import { Bubble, Card, Hint, PageIntro, fieldLabel, inputCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from "../../tableau-de-bord/ui";
import { DEMO_COPY } from "../copy";
import { demoData } from "../fixtures";

export const dynamic = "force-dynamic";

export default async function DemoAgentPage() {
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].agent;
  const demo = DEMO_COPY[lang];
  const { profile } = demoData(lang, new Date());

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <Card>
        <div className="space-y-6">
          <label className="block">
            {fieldLabel(tr.preferredName.label)}
            <input disabled defaultValue={profile.preferred_name} className={inputCls} />
            <Hint>{tr.preferredName.hint}</Hint>
          </label>

          <label className="block">
            {fieldLabel(tr.fullName.label)}
            <input disabled defaultValue={profile.full_name} className={inputCls} />
            <Hint>{tr.fullName.hint}</Hint>
          </label>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              {fieldLabel(tr.language.label)}
              {/* Chaque option se lit dans sa propre langue, comme sur la vraie page. */}
              <select disabled defaultValue={profile.preferred_language} className={selectCls}>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
              <Hint>{tr.language.hint}</Hint>
            </label>

            <label className="block">
              {fieldLabel(tr.speed.label)}
              <select disabled defaultValue={nearestVoiceSpeed(profile.voice_speed)} className={selectCls}>
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
            <input disabled defaultValue={profile.home_address} className={inputCls} />
            <Hint>{tr.homeAddress.hint}</Hint>
          </label>

          <div className="border-t border-line pt-6">
            <label className="block">
              {fieldLabel(tr.instructions.label)}
              <textarea disabled defaultValue={profile.agent_instructions} rows={4} className={textareaCls} />
              <Hint>{tr.instructions.hint}</Hint>
            </label>
            <div className="mt-3">
              <Bubble>{tr.bubble}</Bubble>
            </div>
          </div>

          <div>
            <button disabled className={primaryBtn}>{tr.save}</button>
            <p className="mt-3 max-w-prose text-sm text-muted">{demo.frozen}</p>
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <div className="space-y-4">
          <label className="block">
            {fieldLabel(tr.pin.label)}
            <input disabled placeholder="•••" className={inputCls} />
            <Hint>{tr.pin.hint}</Hint>
          </label>
          <p className="text-sm text-muted">{tr.pin.set}</p>
          <div className="flex flex-wrap gap-3">
            <button disabled className={primaryBtn}>{tr.pin.save}</button>
            <button disabled className={secondaryBtn}>{tr.pin.remove}</button>
          </div>
        </div>
      </Card>
    </>
  );
}
