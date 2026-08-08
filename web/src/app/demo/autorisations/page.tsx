// Autorisations, version démo : le registre de consentement de Sam. Les
// pastilles répondent au clic (état local, composant client) pour montrer le
// geste ; la mention sous la carte précise que rien n'est enregistré ici.

import { siteLanguage } from "@/lib/site-i18n";
import { CONSENT_SOURCES, DASHBOARD } from "../../tableau-de-bord/copy";
import { Bubble, Card, Hint, PageIntro, Section } from "../../tableau-de-bord/ui";
import { DemoConsentToggle } from "../consent-toggle";
import { DEMO_COPY } from "../copy";
import { demoData } from "../fixtures";

export const dynamic = "force-dynamic";

export default async function DemoAutorisationsPage() {
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].autorisations;
  const demo = DEMO_COPY[lang];
  const { consents, phone, trustedCallers } = demoData(lang, new Date());

  const trusted = new Map(trustedCallers.map((t) => [t.subject, t.granted]));

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <div className="mb-6">
        <Bubble>{tr.bubble}</Bubble>
      </div>

      <Card className="divide-y divide-line !p-0">
        {CONSENT_SOURCES.map((source) => (
          <div key={source} className="flex items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{tr.consents[source].label}</p>
              <p className="text-sm text-muted">{tr.consents[source].help}</p>
            </div>
            <DemoConsentToggle
              initial={consents[source]}
              grantedLabel={tr.grantedAction}
              refusedLabel={tr.refusedAction}
            />
          </div>
        ))}
      </Card>
      <Hint>{demo.toggleHint}</Hint>

      <p className="mt-4 max-w-prose text-sm text-muted">
        {tr.footer}
      </p>

      <div className="mt-10">
        <Section title={tr.trusted.title} description={tr.trusted.help}>
          <Card className="divide-y divide-line !p-0">
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{phone.e164}</p>
                <p className="text-sm text-muted">{phone.label}</p>
              </div>
              <DemoConsentToggle
                initial={trusted.get(phone.e164) ?? false}
                grantedLabel={tr.grantedAction}
                refusedLabel={tr.refusedAction}
              />
            </div>
          </Card>
          <Hint>{tr.trusted.stillAsks}</Hint>
        </Section>
      </div>
    </>
  );
}
