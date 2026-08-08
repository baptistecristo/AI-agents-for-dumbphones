// Compte, version démo : le numéro relié et la connexion Google de Sam, en
// lecture seule. Les boutons qui engagent (détacher, exporter) sont figés, et
// la zone de suppression n'a pas sa place ici : on ne supprime pas un
// personnage.

import { siteLanguage } from "@/lib/site-i18n";
import { DASHBOARD } from "../../tableau-de-bord/copy";
import { fr } from "../../tableau-de-bord/format";
import { Bubble, Card, Hint, PageIntro, Section, secondaryBtn } from "../../tableau-de-bord/ui";
import { DEMO_COPY } from "../copy";
import { demoData } from "../fixtures";

export const dynamic = "force-dynamic";

export default async function DemoComptePage() {
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].compte;
  const demo = DEMO_COPY[lang];
  const { phone, google } = demoData(lang, new Date());

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <Section title={tr.phones.title} description={tr.phones.description}>
        <Card>
          <ul className="divide-y divide-line">
            <li className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <span className="font-medium text-ink">{phone.e164}</span>
              <span className="text-sm text-muted">{phone.label}</span>
            </li>
          </ul>
        </Card>
        <Hint>{tr.phones.hint}</Hint>
      </Section>

      <Section title={tr.google.title} description={tr.google.description}>
        <Card>
          <p className="text-ink">
            {tr.google.connectedWith}<span className="font-medium">{google.google_email}</span>
          </p>
          <p className="mt-1 text-sm text-muted">{tr.google.connectedSince.replace("%s", fr(google.connected_at, lang))}</p>
          <button disabled className={`${secondaryBtn} mt-4`}>{tr.google.disconnect}</button>
          <Hint>{tr.google.disconnectHint}</Hint>
        </Card>
      </Section>

      <Section title={tr.export.title} description={tr.export.description}>
        <Card>
          <p className="text-slate">
            {tr.export.body}
          </p>
          <button disabled className={`${secondaryBtn} mt-4`}>{tr.export.download}</button>
          <p className="mt-3 max-w-prose text-sm text-muted">{demo.frozen}</p>
          <div className="mt-4">
            <Bubble>{tr.export.bubble}</Bubble>
          </div>
        </Card>
      </Section>
    </>
  );
}
