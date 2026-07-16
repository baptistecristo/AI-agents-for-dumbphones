// Mon agent : tout ce qui change la façon dont il décroche et te parle. Chaque
// réglage est adossé à du vrai comportement — le prénom et les consignes partent
// dans le prompt, la langue choisit la voix et la transcription, le débit règle
// ElevenLabs, l'adresse sert les itinéraires « depuis chez moi ».

import { redirect } from "next/navigation";
import { normalizeLanguage } from "@/lib/language";
import { agentInstructionsOf } from "@/lib/profile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { VOICE_SPEED_CHOICES, nearestVoiceSpeed } from "../format";
import { Bubble, Card, Hint, PageIntro, fieldLabel, inputCls, primaryBtn, selectCls, textareaCls } from "../ui";
import { updatePersonalization } from "./actions";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ enregistre?: string }> }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Les colonnes stables et les consignes sont lues séparément : agent_instructions
  // arrive avec 0009, et agentInstructionsOf() tolère son absence. La page reste
  // donc correcte que la migration soit appliquée ou non.
  const [{ data: profile }, agentInstructions] = await Promise.all([
    supabaseAdmin()
      .from("profiles")
      .select("preferred_name, full_name, home_address, preferred_language, voice_speed")
      .eq("id", user.id)
      .single(),
    agentInstructionsOf(user.id),
  ]);

  const saved = (await searchParams).enregistre === "1";

  return (
    <>
      <PageIntro eyebrow="Mon agent" title="Régler mon agent">
        La façon dont il décroche et te parle. Tout s&apos;applique dès ton prochain appel.
      </PageIntro>

      {saved && (
        <p className="mb-6 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          Réglages enregistrés.
        </p>
      )}

      <Card>
        <form action={updatePersonalization} className="space-y-6">
          <label className="block">
            {fieldLabel("Comment l'agent doit t'appeler")}
            <input name="preferred_name" defaultValue={profile?.preferred_name ?? ""} placeholder="Ex. : Sam, Camille…" className={inputCls} />
            <Hint>Le prénom qu&apos;il dit en décrochant.</Hint>
          </label>

          <label className="block">
            {fieldLabel("Ton nom complet")}
            <input name="full_name" defaultValue={profile?.full_name ?? ""} placeholder="Ex. : Sam Rivière" className={inputCls} />
            <Hint>Sert quand l&apos;agent appelle un lieu à ta place (« C&apos;est de la part de… »).</Hint>
          </label>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              {fieldLabel("Langue de l'agent")}
              <select name="preferred_language" defaultValue={normalizeLanguage(profile?.preferred_language)} className={selectCls}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
              <Hint>La langue où il décroche. Il te suit si tu changes en cours d&apos;appel.</Hint>
            </label>

            <label className="block">
              {fieldLabel("Débit de parole")}
              <select name="voice_speed" defaultValue={nearestVoiceSpeed(profile?.voice_speed)} className={selectCls}>
                {VOICE_SPEED_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <Hint>La vitesse à laquelle il te parle. Sans effet sur les appels qu&apos;il passe pour toi.</Hint>
            </label>
          </div>

          <label className="block">
            {fieldLabel("Adresse de « chez moi »")}
            <input name="home_address" defaultValue={profile?.home_address ?? ""} placeholder="Ex. : 12 rue de la Paix, 75002 Paris" className={inputCls} />
            <Hint>Le point de départ des itinéraires « depuis chez moi ». Il ne la lit qu&apos;après ton code, et ne la prononce jamais à voix haute.</Hint>
          </label>

          <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
            <label className="block">
              {fieldLabel("Consignes pour ton agent")}
              <textarea
                name="agent_instructions"
                defaultValue={agentInstructions ?? ""}
                maxLength={600}
                rows={4}
                placeholder="Ex. : Vouvoie-moi. Va droit au but. Je suis un peu dur d'oreille, parle lentement et répète les chiffres."
                className={textareaCls}
              />
              <Hint>Le ton et tes préférences durables, dans tes mots. Garde ça court. N&apos;y mets rien de secret : ce texte fait partie de ce que l&apos;agent « sait » en décrochant.</Hint>
            </label>
            <div className="mt-3">
              <Bubble>
                Ces consignes guident mon ton, mais elles ne passent jamais avant tes règles de sécurité :
                je confirme toujours avant d&apos;agir, et je demande ton code pour tes données personnelles.
              </Bubble>
            </div>
          </div>

          <button className={primaryBtn}>Enregistrer</button>
        </form>
      </Card>
    </>
  );
}
