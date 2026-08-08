// Textes propres à la démo en FR/EN/ES : le bandeau qui annonce la fiction, et
// les mentions sous les commandes figées. Tout le reste vient du dictionnaire
// du tableau de bord (copy.ts) : la démo doit se lire exactement comme le vrai.

import { Language } from "@/lib/language";

export type DemoCopy = {
  banner: { tag: string; body: string; cta: string };
  // Sous un formulaire figé : dire pourquoi ça ne bouge pas, et où ça bougera.
  frozen: string;
  // Sous les bascules de consentement : elles répondent au clic, mais localement.
  toggleHint: string;
};

export const DEMO_COPY: Record<Language, DemoCopy> = {
  fr: {
    banner: {
      tag: "Démo",
      body: "Tout ce que tu vois ici est inventé : Sam n'existe pas. C'est ton tableau de bord tel qu'il vivra une fois ton compte créé.",
      cta: "Créer mon compte →",
    },
    frozen: "Dans la démo, ces réglages sont figés. Sur ton compte, chaque champ se modifie ici et ton agent en tient compte dès l'appel suivant.",
    toggleHint: "Ici, la bascule n'engage rien. Sur ton compte, chaque choix est enregistré, daté et révocable.",
  },
  en: {
    banner: {
      tag: "Demo",
      body: "Everything you see here is made up: Sam doesn't exist. This is your dashboard as it will live once your account is created.",
      cta: "Create my account →",
    },
    frozen: "In the demo these settings are frozen. On your account, every field is edited right here and your agent picks it up from the next call.",
    toggleHint: "Here, the toggle commits nothing. On your account, every choice is recorded, dated and revocable.",
  },
  es: {
    banner: {
      tag: "Demo",
      body: "Todo lo que ves aquí es inventado: Sam no existe. Es tu panel tal y como vivirá una vez creada tu cuenta.",
      cta: "Crear mi cuenta →",
    },
    frozen: "En la demo estos ajustes están congelados. En tu cuenta, cada campo se edita aquí mismo y tu agente lo tiene en cuenta desde la siguiente llamada.",
    toggleHint: "Aquí, el interruptor no compromete nada. En tu cuenta, cada elección queda registrada, fechada y es revocable.",
  },
};
