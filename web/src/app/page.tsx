// Landing — la page vitrine. Le héros n'est pas un slogan : c'est un appel
// retranscrit, qui se déroule comme en direct. Le lecteur (souvent l'enfant
// adulte qui équipe son parent) comprend le produit en écoutant Jeanne.

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

const CALL: { who: "j" | "a"; text: string }[] = [
  { who: "j", text: "Allô ? Dites-moi, j'ai quelque chose chez le docteur cette semaine, non ?" },
  { who: "a", text: "Bonjour Jeanne ! Oui : docteur Martin, jeudi à 10 heures." },
  { who: "j", text: "Ah oui. Vous pouvez me le rappeler la veille ?" },
  { who: "a", text: "Bien sûr. Je vous enverrai un message mercredi à 18 heures. C'est noté ?" },
  { who: "j", text: "C'est noté. Et il fera beau, jeudi ?" },
  { who: "a", text: "Plutôt, oui : du soleil et 21 degrés. Parfait pour y aller à pied." },
];

const CAPACITES: { icon: string; titre: string; texte: string }[] = [
  { icon: "📅", titre: "L'agenda", texte: "« Qu'est-ce que j'ai demain ? » — les rendez-vous, dits de vive voix, ajoutés ou déplacés à la demande." },
  { icon: "🔔", titre: "Les rappels", texte: "Médicaments, anniversaires, la veille d'un rendez-vous. Le rappel arrive par SMS, à l'heure dite." },
  { icon: "🌤", titre: "La météo", texte: "Aujourd'hui ou demain, pour savoir s'il faut un parapluie avant de sortir." },
  { icon: "🗺", titre: "Le chemin", texte: "L'itinéraire expliqué à voix haute, puis envoyé par SMS, étape par étape, pour le suivre en route." },
  { icon: "📞", titre: "Les appels difficiles", texte: "Prendre rendez-vous chez le médecin, réserver un taxi ou une table : l'assistant appelle, négocie, et rend compte par SMS." },
  { icon: "✉️", titre: "Les messages", texte: "Un SMS dicté à voix haute, relu avant l'envoi. Rien ne part sans un « oui » clair." },
];

export default function Home() {
  return (
    <main className="bg-paper text-ink">
      {/* ---------------------------------------------------------- header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <p className="font-display text-2xl">
          ☎ <span className="ml-1">{brand}</span>
        </p>
        <nav className="flex items-center gap-4">
          <a href="/connexion" className="rounded-lg px-4 py-2 text-sm font-bold text-bleu underline-offset-4 hover:underline">
            Se connecter
          </a>
          <a
            href="/connexion"
            className="rounded-lg bg-bleu px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-bleu-fonce"
          >
            Équiper un proche
          </a>
        </nav>
      </header>

      {/* ------------------------------------------------------------ héros */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-12 md:grid-cols-2 md:items-center md:pt-20">
        <div>
          <h1 className="font-display text-4xl leading-tight md:text-5xl">
            Il n'y a rien à installer.
            <br />
            <span className="relative inline-block">
              Il suffit d'appeler.
              <span aria-hidden className="absolute inset-x-0 bottom-1 -z-10 h-3 bg-jaune/70" />
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/80">
            {brand} est un assistant au bout du fil, pour celles et ceux qui préfèrent un téléphone
            simple. Agenda, rappels, itinéraires — et même les coups de fil pénibles, passés à leur
            place. D'une voix calme, qui prend son temps.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="/connexion"
              className="rounded-xl bg-bleu px-6 py-4 text-lg font-bold text-white shadow-md transition hover:bg-bleu-fonce"
            >
              Créer le compte d'un proche →
            </a>
            <p className="text-sm text-ink/60">
              Installation en 10 minutes,
              <br />
              par un membre de la famille.
            </p>
          </div>
        </div>

        {/* Signature : l'appel qui se déroule en direct */}
        <figure aria-label="Exemple d'appel entre Jeanne et l'assistant" className="rounded-2xl border border-ink/10 bg-white p-6 shadow-xl shadow-bleu/5">
          <figcaption className="mb-5 flex items-center gap-2 border-b border-ink/10 pb-4 text-sm text-ink/60">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            Appel en cours — Jeanne, 84 ans, depuis son téléphone à touches
          </figcaption>
          <div className="space-y-3">
            {CALL.map((line, i) => (
              <p
                key={i}
                className={`call-line max-w-[85%] rounded-2xl px-4 py-2.5 leading-snug ${
                  line.who === "j"
                    ? "bg-bulle text-ink"
                    : "ml-auto bg-bleu text-white"
                }`}
                style={{ animationDelay: `${0.6 + i * 0.9}s` }}
              >
                {line.text}
              </p>
            ))}
          </div>
        </figure>
      </section>

      {/* ----------------------------------------------------- bande jaune */}
      <div className="bg-jaune">
        <p className="mx-auto max-w-6xl px-6 py-4 text-center font-bold tracking-wide text-ink">
          Aucune application. Aucun écran. Aucun mot de passe. Juste sa voix.
        </p>
      </div>

      {/* ---------------------------------------------------- comment ça marche */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl">Comment ça marche</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {[
            {
              n: "1",
              titre: "Un proche prépare le compte",
              texte:
                "Sur ce site : le numéro de téléphone du parent, son agenda Google si on le souhaite, un code secret à quatre chiffres. Dix minutes, une seule fois.",
            },
            {
              n: "2",
              titre: "La personne appelle son numéro",
              texte:
                "Depuis son téléphone habituel, même le plus simple. L'assistant décroche, la reconnaît, l'appelle par son prénom et parle lentement.",
            },
            {
              n: "3",
              titre: "Les choses se font",
              texte:
                "Rendez-vous notés, rappels envoyés, taxi réservé. Tout ce qui engage est relu à voix haute et confirmé avant d'être fait. Compte-rendu par SMS.",
            },
          ].map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-ink/10 bg-white p-6">
              <span className="font-display absolute -top-5 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-jaune text-xl">
                {s.n}
              </span>
              <h3 className="mt-4 text-xl font-bold">{s.titre}</h3>
              <p className="mt-2 leading-relaxed text-ink/75">{s.texte}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- capacités */}
      <section className="border-y border-ink/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl">Ce qu'on peut lui demander</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CAPACITES.map((c) => (
              <div key={c.titre} className="rounded-2xl bg-paper p-6">
                <p className="text-2xl" aria-hidden>
                  {c.icon}
                </p>
                <h3 className="mt-3 text-lg font-bold">{c.titre}</h3>
                <p className="mt-1 leading-relaxed text-ink/75">{c.texte}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-ink/60">
            Et par SMS aussi : envoyez <span className="font-mono font-bold">METEO</span>,{" "}
            <span className="font-mono font-bold">AGENDA</span> ou{" "}
            <span className="font-mono font-bold">RAPPEL 18h médicament</span> au même numéro.
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------- confiance */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl">Pensé pour rassurer, d'abord</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold">🔐 Un code secret, à l'oral</h3>
            <p className="mt-2 leading-relaxed text-ink/75">
              Envoyer un message ou passer un appel exige le code à quatre chiffres de la personne.
              Un numéro imité ne suffit pas.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold">✋ Rien ne part sans un « oui »</h3>
            <p className="mt-2 leading-relaxed text-ink/75">
              Chaque action est relue à voix haute et attend une confirmation claire. Une hésitation
              vaut non.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold">🇪🇺 Des données en Europe</h3>
            <p className="mt-2 leading-relaxed text-ink/75">
              Consentements enregistrés et révocables, données hébergées en Europe, droit à
              l'effacement. La famille voit tout sur le tableau de bord.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- CTA final */}
      <section className="bg-bleu">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="font-display text-3xl text-white">
            Offrez un coup de main au bout du fil.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">
            Créez le compte, reliez son téléphone, choisissez ensemble le code secret. Il ne reste
            plus qu'à appeler.
          </p>
          <a
            href="/connexion"
            className="mt-8 inline-block rounded-xl bg-jaune px-8 py-4 text-lg font-bold text-ink shadow-lg transition hover:brightness-105"
          >
            Commencer maintenant
          </a>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink/60">
        <p>
          ☎ {brand} — l'assistant qu'on appelle, tout simplement.
        </p>
        <p>Fait en France · Données hébergées en Europe · RGPD</p>
      </footer>
    </main>
  );
}
