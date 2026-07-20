// Textes de l'espace personnel en FR/EN/ES. Même structure dans les trois
// langues : une langue incomplète ne compile pas. Les libellés d'options du
// sélecteur « Langue de l'agent » restent chacun dans sa propre langue et ne
// vivent donc pas ici (Français / English / Español, côté page).

import { Language } from "@/lib/language";

// Les sources du registre de consentement, dans l'ordre d'affichage.
// `call_recap` est l'interrupteur du résumé relu au téléphone : absent du
// registre = éteint, et c'est l'état de départ de tout le monde.
export const CONSENT_SOURCES = [
  "calendar",
  "contacts",
  "sms",
  "outbound_calls",
  "memory",
  "recording",
  "call_recap",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export type DashboardCopy = {
  layout: {
    greeting: string;
    phoneLinked: string; // "%s" = numéro
    noPhone: string;
    googleConnected: string; // "%s" = adresse Google
    googleNotConnected: string;
    signOut: string;
    footerBefore: string;
    footerLink: string;
    footerAfter: string;
  };
  nav: {
    aria: string;
    labels: Record<"overview" | "agent" | "memory" | "permissions" | "account", string>;
  };
  overview: {
    eyebrow: string;
    title: string;
    intro: string;
    glanceTitle: string;
    language: string;
    speed: string;
    homeAddress: string;
    homeSet: string;
    memoryNotes: string;
    tuneAgent: string;
    manageMemory: string;
    callsTitle: string;
    callsEmpty: string;
    inboundCall: string;
    mission: string; // "%s" = nom de l'agent (valeur en base)
    noSummary: string;
    jobsTitle: string;
    jobStatus: Record<"done" | "failed" | "calling" | "needs_user" | "pending", string>;
    remindersTitle: string;
    remindersEmpty: string;
    remindersEmptyLink: string;
  };
  agent: {
    eyebrow: string;
    title: string;
    intro: string;
    saved: string;
    preferredName: { label: string; placeholder: string; hint: string };
    fullName: { label: string; placeholder: string; hint: string };
    language: { label: string; hint: string };
    speed: { label: string; hint: string };
    homeAddress: { label: string; placeholder: string; hint: string };
    instructions: { label: string; placeholder: string; hint: string };
    pin: {
      label: string;
      hint: string;
      set: string;
      unset: string;
      save: string;
      remove: string;
      saved: string;
      cleared: string;
      badFormat: string;
      error: string;
    };
    bubble: string;
    save: string;
  };
  autorisations: {
    eyebrow: string;
    title: string;
    intro: string;
    bubble: string;
    consents: Record<ConsentSource, { label: string; help: string }>;
    grantedAction: string;
    refusedAction: string;
    footer: string;
    scopeNote: string; // écrit en base : la note que la personne a réellement vue
  };
  compte: {
    eyebrow: string;
    title: string;
    intro: string;
    phones: { title: string; description: string; empty: string; hint: string };
    google: {
      title: string;
      description: string;
      connectedWith: string; // suivi de l'adresse, en gras
      connectedSince: string; // "%s" = date
      disconnect: string;
      disconnectHint: string;
      notConnected: string;
      notConnectedBody: string;
      connect: string;
    };
    export: { title: string; description: string; body: string; download: string; bubble: string };
    danger: {
      title: string;
      description: string;
      confirmError: string;
      intro: string;
      items: string[];
      warning: string;
      confirmLabelBefore: string; // suivi de la phrase, en mono
      confirmPhrase: string;
      confirmAria: string;
      deleteButton: string;
    };
  };
  memoire: {
    eyebrow: string;
    title: string;
    intro: string;
    recurrence: Record<"daily" | "weekly" | "monthly", string>;
    notes: {
      title: string;
      description: string;
      bubble: string;
      keyLabel: string;
      keyPlaceholder: string;
      keyHint: string;
      valueLabel: string;
      valuePlaceholder: string;
      add: string;
      empty: string;
    };
    reminders: { title: string; description: string; empty: string };
    row: {
      saving: string;
      save: string;
      cancel: string;
      edit: string;
      delete: string;
      deleteQ: string;
      cancelQ: string;
      yes: string;
      no: string;
      editAria: string; // "%s" = clé de la note
      deleteAria: string; // "%s" = clé de la note
      confirmDeleteAria: string; // "%s" = clé de la note
      cancelReminderAria: string; // "%s" = texte du rappel
      cancelReminderFallback: string;
    };
  };
};

export const DASHBOARD: Record<Language, DashboardCopy> = {
  fr: {
    layout: {
      greeting: "Bonjour",
      phoneLinked: "Téléphone relié : %s",
      noPhone: "Aucun téléphone relié",
      googleConnected: " · Google : %s",
      googleNotConnected: " · Google non connecté",
      signOut: "Se déconnecter",
      footerBefore:
        "Tes données restent en Europe, chiffrées. Tu peux les exporter ou supprimer ton compte depuis ",
      footerLink: "Compte",
      footerAfter: " (droit à l'effacement, RGPD).",
    },
    nav: {
      aria: "Espace personnel",
      labels: {
        overview: "Aperçu",
        agent: "Mon agent",
        memory: "Ma mémoire",
        permissions: "Autorisations",
        account: "Compte",
      },
    },
    overview: {
      eyebrow: "Espace personnel",
      title: "Aperçu",
      intro: "Ce que ton agent a fait, et comment il est réglé. Le détail se change dans les autres sections.",
      glanceTitle: "Ton agent en un coup d'œil",
      language: "Langue",
      speed: "Débit",
      homeAddress: "Adresse « chez moi »",
      homeSet: "définie",
      memoryNotes: "Notes en mémoire",
      tuneAgent: "Régler mon agent →",
      manageMemory: "Gérer ma mémoire →",
      callsTitle: "Derniers appels",
      callsEmpty: "Aucun appel pour l'instant. Appelle ton numéro pour essayer !",
      inboundCall: "Appel reçu",
      mission: "Mission %s",
      noSummary: "(pas encore de résumé)",
      jobsTitle: "Missions (appels passés à ta place)",
      jobStatus: {
        done: "fait",
        failed: "échec",
        calling: "en cours",
        needs_user: "à voir",
        pending: "en attente",
      },
      remindersTitle: "Rappels à venir",
      remindersEmpty: "Aucun rappel programmé. ",
      remindersEmptyLink: "En ajouter un →",
    },
    agent: {
      eyebrow: "Mon agent",
      title: "Régler mon agent",
      intro: "La façon dont il décroche et te parle. Tout s'applique dès ton prochain appel.",
      saved: "Réglages enregistrés.",
      preferredName: {
        label: "Comment l'agent doit t'appeler",
        placeholder: "Ex. : Sam, Camille…",
        hint: "Le prénom qu'il dit en décrochant.",
      },
      fullName: {
        label: "Ton nom complet",
        placeholder: "Ex. : Sam Rivière",
        hint: "Sert quand l'agent appelle un lieu à ta place (« C'est de la part de… »).",
      },
      language: {
        label: "Langue de l'agent",
        hint: "La langue où il décroche. Il te suit si tu changes en cours d'appel.",
      },
      speed: {
        label: "Débit de parole",
        hint: "La vitesse à laquelle il te parle. Sans effet sur les appels qu'il passe pour toi.",
      },
      homeAddress: {
        label: "Adresse de « chez moi »",
        placeholder: "Ex. : 12 rue de la Paix, 75002 Paris",
        hint: "Le point de départ des itinéraires « depuis chez moi ». Il ne la lit qu'après ton code, et ne la prononce jamais à voix haute.",
      },
      instructions: {
        label: "Consignes pour ton agent",
        placeholder:
          "Ex. : Vouvoie-moi. Va droit au but. Je suis un peu dur d'oreille, parle lentement et répète les chiffres.",
        hint: "Le ton et tes préférences durables, dans tes mots. Garde ça court. N'y mets rien de secret : ce texte fait partie de ce que l'agent « sait » en décrochant.",
      },
      pin: {
        label: "Code de sécurité par SMS",
        hint: "Un code à 3 chiffres. Par SMS, il débloque les actions qui envoient ou modifient quelque chose (envoyer un message, passer un appel, changer un rendez-vous). Lire ton agenda ou tes contacts n'en a jamais besoin.",
        set: "Un code est réglé.",
        unset: "Aucun code réglé : par SMS, les actions qui envoient ou modifient resteront bloquées.",
        save: "Enregistrer le code",
        remove: "Retirer le code",
        saved: "Code enregistré.",
        cleared: "Code retiré.",
        badFormat: "Le code doit faire exactement 3 chiffres.",
        error: "Le code n'a pas pu être enregistré. Réessaie dans un instant.",
      },
      bubble:
        "Ces consignes guident mon ton, mais elles ne passent jamais avant tes règles de sécurité : je confirme toujours avant d'agir, et je demande ton code pour tes données personnelles.",
      save: "Enregistrer",
    },
    autorisations: {
      eyebrow: "Autorisations",
      title: "Autorisations",
      intro:
        "Ton registre de consentement : ce que tu as autorisé, horodaté, et sur quoi tu peux changer d'avis, ligne par ligne.",
      bubble:
        "Je te demande toujours ton code avant de toucher à tes données perso, quoi qu'il arrive ici. Ce registre garde la trace de tes choix.",
      consents: {
        calendar: { label: "Agenda", help: "Lire et modifier tes rendez-vous." },
        contacts: { label: "Contacts", help: "Retrouver un nom, un numéro." },
        sms: { label: "SMS", help: "T'écrire des rappels, itinéraires, comptes-rendus." },
        outbound_calls: {
          label: "Appels à ma place",
          help: "Appeler un lieu pour toi : restaurant, taxi, rendez-vous.",
        },
        memory: {
          label: "Mémoire des préférences",
          help: "Retenir tes lieux, tes personnes, tes habitudes.",
        },
        recording: {
          label: "Enregistrement des appels",
          help: "Garder et transcrire tes appels pour le suivi.",
        },
        call_recap: {
          label: "Résumé de l'appel précédent",
          help: "Te relire au téléphone le résumé de ton dernier appel, quand tu me le demandes. Jamais un appel que j'ai passé pour toi.",
        },
      },
      grantedAction: "Autorisé — révoquer",
      refusedAction: "Refusé — autoriser",
      footer:
        "Chaque changement s'ajoute au registre avec la date et l'heure. Rien n'est effacé : tu gardes l'historique complet de tes choix.",
      scopeNote: "Modifié depuis l'espace personnel",
    },
    compte: {
      eyebrow: "Compte",
      title: "Compte",
      intro: "Tes connexions, tes données, et la porte de sortie si un jour tu veux partir.",
      phones: {
        title: "Téléphones reliés",
        description:
          "Les numéros depuis lesquels tu appelles ton agent. C'est à ton numéro qu'il te reconnaît.",
        empty: "Aucun numéro relié pour l'instant.",
        hint: "Pour relier un autre numéro, ça se passe à la mise en route, ou avec le support : il faut le vérifier par SMS.",
      },
      google: {
        title: "Google",
        description:
          "Ton agenda et tes contacts, pour que l'agent lise tes rendez-vous et appelle les bonnes personnes.",
        connectedWith: "Connecté avec ",
        connectedSince: "Relié depuis le %s.",
        disconnect: "Déconnecter Google",
        disconnectHint:
          "En te déconnectant, l'agenda et les contacts s'arrêtent jusqu'à une nouvelle connexion. Le reste de ton compte ne bouge pas.",
        notConnected: "Google n'est pas connecté.",
        notConnectedBody: "Sans lui, l'agent ne peut ni lire ton agenda ni retrouver tes contacts.",
        connect: "Connecter Google",
      },
      export: {
        title: "Exporter mes données",
        description: "Tout ce que l'agent sait de toi, dans un fichier. Les jetons chiffrés n'y sont pas.",
        body: "Un fichier JSON : ton profil, tes numéros, tes rappels, tes notes, et ton historique d'appels et de SMS. Il se télécharge tout de suite, et il est à toi.",
        download: "Télécharger mes données",
        bubble:
          "Ce fichier, c'est tout ce que je garde de toi. Mes accès chiffrés n'y sont pas : ils me servent à agir, pas à être lus.",
      },
      danger: {
        title: "Supprimer mon compte",
        description: "Ton droit à l'effacement. Ce que tu supprimes ici part définitivement.",
        confirmError: "La phrase de confirmation ne correspondait pas. Rien n'a été supprimé.",
        intro: "Supprimer ton compte efface tout, définitivement :",
        items: [
          "le compte et ton accès",
          "les numéros reliés",
          "tes notes et ta mémoire",
          "tes rappels",
          "ton historique d'appels et de SMS",
        ],
        warning:
          "C'est immédiat et sans retour. Personne, pas même le support, ne pourra les récupérer. Pense à exporter tes données avant, si tu veux les garder.",
        confirmLabelBefore: "Pour confirmer, tape ",
        confirmPhrase: "SUPPRIMER MON COMPTE",
        confirmAria: "Tape SUPPRIMER MON COMPTE pour confirmer la suppression",
        deleteButton: "Supprimer définitivement mon compte",
      },
    },
    memoire: {
      eyebrow: "Ma mémoire",
      title: "Ma mémoire",
      intro:
        "Les infos que tu me confies et les rappels que tu m'as demandés. C'est ce que je garde pour toi entre deux appels.",
      recurrence: { daily: "chaque jour", weekly: "chaque semaine", monthly: "chaque mois" },
      notes: {
        title: "Mes notes",
        description:
          "Une info à retenir : un code, une date, une habitude. Un sujet (la clé) et ce dont je dois me souvenir.",
        bubble:
          "Ce que tu écris ici, je m'en souviens quand tu m'appelles. Demande-moi « c'est quoi le code du garage ? » et je te le lis — mais seulement après ton code. Sans lui, tes notes ne sortent pas.",
        keyLabel: "Le sujet",
        keyPlaceholder: "Ex. : code du garage",
        keyHint: "Le mot-clé pour retrouver la note plus tard. « code du garage », « médecin », « poubelles »…",
        valueLabel: "Ce dont je dois me souvenir",
        valuePlaceholder: "Ex. : 4592, puis dièse. Le bouton est à gauche.",
        add: "Ajouter à ma mémoire",
        empty:
          "Tu n'as encore rien noté. Ajoute une info ci-dessus — ou dis-moi « retiens que… » en m'appelant, et elle apparaîtra ici.",
      },
      reminders: {
        title: "Mes rappels",
        description: "Les rappels en attente. Ils se créent en m'appelant ; ici, tu peux les annuler.",
        empty:
          "Aucun rappel pour l'instant. Tu en programmes un en m'appelant (« rappelle-moi de… »). Il apparaîtra ici, et tu pourras l'annuler.",
      },
      row: {
        saving: "Enregistrement…",
        save: "Enregistrer",
        cancel: "Annuler",
        edit: "Modifier",
        delete: "Supprimer",
        deleteQ: "Supprimer ?",
        cancelQ: "Annuler ?",
        yes: "Oui",
        no: "Non",
        editAria: "Modifier la note « %s »",
        deleteAria: "Supprimer la note « %s »",
        confirmDeleteAria: "Confirmer la suppression de la note « %s »",
        cancelReminderAria: "Annuler le rappel : %s",
        cancelReminderFallback: "Annuler ce rappel",
      },
    },
  },
  en: {
    layout: {
      greeting: "Hello",
      phoneLinked: "Phone linked: %s",
      noPhone: "No phone linked",
      googleConnected: " · Google: %s",
      googleNotConnected: " · Google not connected",
      signOut: "Sign out",
      footerBefore:
        "Your data stays in Europe, encrypted. You can export it or delete your account from ",
      footerLink: "Account",
      footerAfter: " (right to erasure, GDPR).",
    },
    nav: {
      aria: "Personal space",
      labels: {
        overview: "Overview",
        agent: "My agent",
        memory: "My memory",
        permissions: "Permissions",
        account: "Account",
      },
    },
    overview: {
      eyebrow: "Personal space",
      title: "Overview",
      intro: "What your agent has done, and how it's set up. The details change in the other sections.",
      glanceTitle: "Your agent at a glance",
      language: "Language",
      speed: "Pace",
      homeAddress: "\"Home\" address",
      homeSet: "set",
      memoryNotes: "Notes in memory",
      tuneAgent: "Tune my agent →",
      manageMemory: "Manage my memory →",
      callsTitle: "Recent calls",
      callsEmpty: "No calls yet. Call your number to try it!",
      inboundCall: "Call received",
      mission: "Mission %s",
      noSummary: "(no summary yet)",
      jobsTitle: "Missions (calls made on your behalf)",
      jobStatus: {
        done: "done",
        failed: "failed",
        calling: "in progress",
        needs_user: "needs you",
        pending: "pending",
      },
      remindersTitle: "Upcoming reminders",
      remindersEmpty: "No reminders scheduled. ",
      remindersEmptyLink: "Add one →",
    },
    agent: {
      eyebrow: "My agent",
      title: "Tune my agent",
      intro: "How it picks up and talks to you. Everything applies from your next call.",
      saved: "Settings saved.",
      preferredName: {
        label: "What the agent should call you",
        placeholder: "E.g. Sam, Camille…",
        hint: "The name it says when picking up.",
      },
      fullName: {
        label: "Your full name",
        placeholder: "E.g. Sam Rivière",
        hint: "Used when the agent calls somewhere on your behalf (\"I'm calling for…\").",
      },
      language: {
        label: "Agent language",
        hint: "The language it picks up in. It follows you if you switch mid-call.",
      },
      speed: {
        label: "Speaking pace",
        hint: "How fast it talks to you. No effect on the calls it makes for you.",
      },
      homeAddress: {
        label: "\"Home\" address",
        placeholder: "E.g. 12 rue de la Paix, 75002 Paris",
        hint: "The starting point for \"from home\" directions. It only reads it after your code, and never says it out loud.",
      },
      instructions: {
        label: "Instructions for your agent",
        placeholder:
          "E.g. Get to the point. I'm a bit hard of hearing, speak slowly and repeat numbers.",
        hint: "The tone and your lasting preferences, in your words. Keep it short. Put nothing secret here: this text is part of what the agent \"knows\" when picking up.",
      },
      pin: {
        label: "Security code by SMS",
        hint: "A 3-digit code. By text, it unlocks actions that send or change something (texting someone, placing a call, moving an appointment). Reading your calendar or contacts never needs it.",
        set: "A code is set.",
        unset: "No code set: by text, actions that send or change something will stay blocked.",
        save: "Save code",
        remove: "Remove code",
        saved: "Code saved.",
        cleared: "Code removed.",
        badFormat: "The code must be exactly 3 digits.",
        error: "The code couldn't be saved. Try again in a moment.",
      },
      bubble:
        "These instructions guide my tone, but they never come before your safety rules: I always confirm before acting, and I ask for your code for your personal data.",
      save: "Save",
    },
    autorisations: {
      eyebrow: "Permissions",
      title: "Permissions",
      intro:
        "Your consent register: what you've allowed, timestamped, and what you can change your mind about, line by line.",
      bubble:
        "I always ask for your code before touching your personal data, whatever happens here. This register keeps track of your choices.",
      consents: {
        calendar: { label: "Calendar", help: "Read and edit your appointments." },
        contacts: { label: "Contacts", help: "Find a name, a number." },
        sms: { label: "SMS", help: "Text you reminders, directions, reports." },
        outbound_calls: {
          label: "Calls on my behalf",
          help: "Call somewhere for you: restaurant, taxi, appointments.",
        },
        memory: {
          label: "Preference memory",
          help: "Remember your places, your people, your habits.",
        },
        recording: {
          label: "Call recording",
          help: "Keep and transcribe your calls for follow-up.",
        },
        call_recap: {
          label: "Recap of the previous call",
          help: "Read you back the summary of your last call, over the phone, when you ask for it. Never a call I placed for you.",
        },
      },
      grantedAction: "Allowed — revoke",
      refusedAction: "Refused — allow",
      footer:
        "Every change is added to the register with the date and time. Nothing is erased: you keep the full history of your choices.",
      scopeNote: "Changed from the personal space",
    },
    compte: {
      eyebrow: "Account",
      title: "Account",
      intro: "Your connections, your data, and the way out if one day you want to leave.",
      phones: {
        title: "Linked phones",
        description: "The numbers you call your agent from. Your number is how it recognizes you.",
        empty: "No number linked yet.",
        hint: "To link another number, it happens during setup, or with support: it needs to be verified by SMS.",
      },
      google: {
        title: "Google",
        description:
          "Your calendar and contacts, so the agent reads your appointments and calls the right people.",
        connectedWith: "Connected with ",
        connectedSince: "Linked since %s.",
        disconnect: "Disconnect Google",
        disconnectHint:
          "By disconnecting, calendar and contacts stop until you connect again. The rest of your account doesn't move.",
        notConnected: "Google isn't connected.",
        notConnectedBody: "Without it, the agent can't read your calendar or find your contacts.",
        connect: "Connect Google",
      },
      export: {
        title: "Export my data",
        description: "Everything the agent knows about you, in one file. The encrypted tokens aren't in it.",
        body: "A JSON file: your profile, your numbers, your reminders, your notes, and your call and SMS history. It downloads right away, and it's yours.",
        download: "Download my data",
        bubble:
          "This file is everything I keep about you. My encrypted access isn't in it: it helps me act, not be read.",
      },
      danger: {
        title: "Delete my account",
        description: "Your right to erasure. What you delete here is gone for good.",
        confirmError: "The confirmation phrase didn't match. Nothing was deleted.",
        intro: "Deleting your account erases everything, permanently:",
        items: [
          "the account and your access",
          "the linked numbers",
          "your notes and your memory",
          "your reminders",
          "your call and SMS history",
        ],
        warning:
          "It's immediate and there's no way back. No one, not even support, can recover them. Export your data first if you want to keep it.",
        confirmLabelBefore: "To confirm, type ",
        confirmPhrase: "DELETE MY ACCOUNT",
        confirmAria: "Type DELETE MY ACCOUNT to confirm the deletion",
        deleteButton: "Permanently delete my account",
      },
    },
    memoire: {
      eyebrow: "My memory",
      title: "My memory",
      intro:
        "The info you trust me with and the reminders you've asked me for. It's what I keep for you between calls.",
      recurrence: { daily: "every day", weekly: "every week", monthly: "every month" },
      notes: {
        title: "My notes",
        description:
          "Something to remember: a code, a date, a habit. A subject (the key) and what I should remember.",
        bubble:
          "What you write here, I remember when you call me. Ask me \"what's the garage code?\" and I read it to you — but only after your code. Without it, your notes stay put.",
        keyLabel: "The subject",
        keyPlaceholder: "E.g. garage code",
        keyHint: "The keyword to find the note later. \"garage code\", \"doctor\", \"bins\"…",
        valueLabel: "What I should remember",
        valuePlaceholder: "E.g. 4592, then hash. The button is on the left.",
        add: "Add to my memory",
        empty:
          "You haven't noted anything yet. Add something above — or tell me \"remember that…\" when you call, and it will show up here.",
      },
      reminders: {
        title: "My reminders",
        description: "The pending reminders. They're created by calling me; here, you can cancel them.",
        empty:
          "No reminders yet. You schedule one by calling me (\"remind me to…\"). It will show up here, and you can cancel it.",
      },
      row: {
        saving: "Saving…",
        save: "Save",
        cancel: "Cancel",
        edit: "Edit",
        delete: "Delete",
        deleteQ: "Delete?",
        cancelQ: "Cancel?",
        yes: "Yes",
        no: "No",
        editAria: "Edit the note \"%s\"",
        deleteAria: "Delete the note \"%s\"",
        confirmDeleteAria: "Confirm deleting the note \"%s\"",
        cancelReminderAria: "Cancel the reminder: %s",
        cancelReminderFallback: "Cancel this reminder",
      },
    },
  },
  es: {
    layout: {
      greeting: "Hola",
      phoneLinked: "Teléfono vinculado: %s",
      noPhone: "Ningún teléfono vinculado",
      googleConnected: " · Google: %s",
      googleNotConnected: " · Google no conectado",
      signOut: "Cerrar sesión",
      footerBefore:
        "Tus datos se quedan en Europa, cifrados. Puedes exportarlos o eliminar tu cuenta desde ",
      footerLink: "Cuenta",
      footerAfter: " (derecho de supresión, RGPD).",
    },
    nav: {
      aria: "Espacio personal",
      labels: {
        overview: "Resumen",
        agent: "Mi agente",
        memory: "Mi memoria",
        permissions: "Permisos",
        account: "Cuenta",
      },
    },
    overview: {
      eyebrow: "Espacio personal",
      title: "Resumen",
      intro: "Lo que ha hecho tu agente y cómo está configurado. Los detalles se cambian en las otras secciones.",
      glanceTitle: "Tu agente de un vistazo",
      language: "Idioma",
      speed: "Ritmo",
      homeAddress: "Dirección de «mi casa»",
      homeSet: "definida",
      memoryNotes: "Notas en memoria",
      tuneAgent: "Ajustar mi agente →",
      manageMemory: "Gestionar mi memoria →",
      callsTitle: "Últimas llamadas",
      callsEmpty: "Aún no hay llamadas. ¡Llama a tu número para probar!",
      inboundCall: "Llamada recibida",
      mission: "Misión %s",
      noSummary: "(aún sin resumen)",
      jobsTitle: "Misiones (llamadas hechas en tu nombre)",
      jobStatus: {
        done: "hecho",
        failed: "fallo",
        calling: "en curso",
        needs_user: "por revisar",
        pending: "en espera",
      },
      remindersTitle: "Próximos recordatorios",
      remindersEmpty: "Ningún recordatorio programado. ",
      remindersEmptyLink: "Añadir uno →",
    },
    agent: {
      eyebrow: "Mi agente",
      title: "Ajustar mi agente",
      intro: "Cómo descuelga y te habla. Todo se aplica desde tu próxima llamada.",
      saved: "Ajustes guardados.",
      preferredName: {
        label: "Cómo debe llamarte el agente",
        placeholder: "Ej.: Sam, Camille…",
        hint: "El nombre que dice al descolgar.",
      },
      fullName: {
        label: "Tu nombre completo",
        placeholder: "Ej.: Sam Rivière",
        hint: "Se usa cuando el agente llama a un sitio en tu nombre («Llamo de parte de…»).",
      },
      language: {
        label: "Idioma del agente",
        hint: "El idioma en el que descuelga. Te sigue si cambias durante la llamada.",
      },
      speed: {
        label: "Ritmo de habla",
        hint: "La velocidad a la que te habla. No afecta a las llamadas que hace por ti.",
      },
      homeAddress: {
        label: "Dirección de «mi casa»",
        placeholder: "Ej.: Calle Mayor 12, 28013 Madrid",
        hint: "El punto de partida de las rutas «desde mi casa». Solo la lee después de tu código, y nunca la dice en voz alta.",
      },
      instructions: {
        label: "Instrucciones para tu agente",
        placeholder:
          "Ej.: Háblame de usted. Ve al grano. Soy un poco duro de oído, habla despacio y repite las cifras.",
        hint: "El tono y tus preferencias duraderas, con tus palabras. Que sea corto. No pongas nada secreto: este texto forma parte de lo que el agente «sabe» al descolgar.",
      },
      pin: {
        label: "Código de seguridad por SMS",
        hint: "Un código de 3 cifras. Por SMS, desbloquea las acciones que envían o modifican algo (enviar un mensaje, hacer una llamada, cambiar una cita). Leer tu agenda o tus contactos nunca lo necesita.",
        set: "Hay un código puesto.",
        unset: "No hay código: por SMS, las acciones que envían o modifican algo seguirán bloqueadas.",
        save: "Guardar código",
        remove: "Quitar código",
        saved: "Código guardado.",
        cleared: "Código quitado.",
        badFormat: "El código debe tener exactamente 3 cifras.",
        error: "No se pudo guardar el código. Inténtalo en un momento.",
      },
      bubble:
        "Estas instrucciones guían mi tono, pero nunca pasan por delante de tus reglas de seguridad: siempre confirmo antes de actuar, y te pido tu código para tus datos personales.",
      save: "Guardar",
    },
    autorisations: {
      eyebrow: "Permisos",
      title: "Permisos",
      intro:
        "Tu registro de consentimiento: lo que has autorizado, con fecha y hora, y sobre lo que puedes cambiar de opinión, línea a línea.",
      bubble:
        "Siempre te pido tu código antes de tocar tus datos personales, pase lo que pase aquí. Este registro guarda el rastro de tus elecciones.",
      consents: {
        calendar: { label: "Agenda", help: "Leer y modificar tus citas." },
        contacts: { label: "Contactos", help: "Encontrar un nombre, un número." },
        sms: { label: "SMS", help: "Escribirte recordatorios, rutas, resúmenes." },
        outbound_calls: {
          label: "Llamadas en mi nombre",
          help: "Llamar a un sitio por ti: restaurante, taxi, citas.",
        },
        memory: {
          label: "Memoria de preferencias",
          help: "Recordar tus lugares, tus personas, tus costumbres.",
        },
        recording: {
          label: "Grabación de las llamadas",
          help: "Guardar y transcribir tus llamadas para el seguimiento.",
        },
        call_recap: {
          label: "Resumen de la llamada anterior",
          help: "Releerte por teléfono el resumen de tu última llamada, cuando me lo pidas. Nunca una llamada que haya hecho por ti.",
        },
      },
      grantedAction: "Autorizado — revocar",
      refusedAction: "Rechazado — autorizar",
      footer:
        "Cada cambio se añade al registro con la fecha y la hora. Nada se borra: conservas el historial completo de tus elecciones.",
      scopeNote: "Modificado desde el espacio personal",
    },
    compte: {
      eyebrow: "Cuenta",
      title: "Cuenta",
      intro: "Tus conexiones, tus datos, y la puerta de salida si un día quieres irte.",
      phones: {
        title: "Teléfonos vinculados",
        description: "Los números desde los que llamas a tu agente. Te reconoce por tu número.",
        empty: "Ningún número vinculado por ahora.",
        hint: "Para vincular otro número, se hace en la puesta en marcha, o con el soporte: hay que verificarlo por SMS.",
      },
      google: {
        title: "Google",
        description:
          "Tu agenda y tus contactos, para que el agente lea tus citas y llame a las personas correctas.",
        connectedWith: "Conectado con ",
        connectedSince: "Vinculado desde el %s.",
        disconnect: "Desconectar Google",
        disconnectHint:
          "Al desconectarte, la agenda y los contactos se detienen hasta una nueva conexión. El resto de tu cuenta no cambia.",
        notConnected: "Google no está conectado.",
        notConnectedBody: "Sin él, el agente no puede leer tu agenda ni encontrar tus contactos.",
        connect: "Conectar Google",
      },
      export: {
        title: "Exportar mis datos",
        description: "Todo lo que el agente sabe de ti, en un archivo. Los tokens cifrados no están.",
        body: "Un archivo JSON: tu perfil, tus números, tus recordatorios, tus notas, y tu historial de llamadas y SMS. Se descarga al momento, y es tuyo.",
        download: "Descargar mis datos",
        bubble:
          "Este archivo es todo lo que guardo de ti. Mis accesos cifrados no están: me sirven para actuar, no para ser leídos.",
      },
      danger: {
        title: "Eliminar mi cuenta",
        description: "Tu derecho de supresión. Lo que eliminas aquí desaparece definitivamente.",
        confirmError: "La frase de confirmación no coincidía. No se ha eliminado nada.",
        intro: "Eliminar tu cuenta lo borra todo, definitivamente:",
        items: [
          "la cuenta y tu acceso",
          "los números vinculados",
          "tus notas y tu memoria",
          "tus recordatorios",
          "tu historial de llamadas y SMS",
        ],
        warning:
          "Es inmediato y sin vuelta atrás. Nadie, ni siquiera el soporte, podrá recuperarlos. Exporta tus datos antes, si quieres conservarlos.",
        confirmLabelBefore: "Para confirmar, escribe ",
        confirmPhrase: "ELIMINAR MI CUENTA",
        confirmAria: "Escribe ELIMINAR MI CUENTA para confirmar la eliminación",
        deleteButton: "Eliminar mi cuenta definitivamente",
      },
    },
    memoire: {
      eyebrow: "Mi memoria",
      title: "Mi memoria",
      intro:
        "La información que me confías y los recordatorios que me has pedido. Es lo que guardo para ti entre dos llamadas.",
      recurrence: { daily: "cada día", weekly: "cada semana", monthly: "cada mes" },
      notes: {
        title: "Mis notas",
        description:
          "Algo que retener: un código, una fecha, una costumbre. Un tema (la clave) y lo que debo recordar.",
        bubble:
          "Lo que escribes aquí, lo recuerdo cuando me llamas. Pregúntame «¿cuál es el código del garaje?» y te lo leo — pero solo después de tu código. Sin él, tus notas no salen.",
        keyLabel: "El tema",
        keyPlaceholder: "Ej.: código del garaje",
        keyHint: "La palabra clave para encontrar la nota después. «código del garaje», «médico», «basura»…",
        valueLabel: "Lo que debo recordar",
        valuePlaceholder: "Ej.: 4592, luego almohadilla. El botón está a la izquierda.",
        add: "Añadir a mi memoria",
        empty:
          "Aún no has anotado nada. Añade algo arriba — o dime «recuerda que…» al llamarme, y aparecerá aquí.",
      },
      reminders: {
        title: "Mis recordatorios",
        description: "Los recordatorios pendientes. Se crean llamándome; aquí puedes cancelarlos.",
        empty:
          "Ningún recordatorio por ahora. Programas uno llamándome («recuérdame que…»). Aparecerá aquí, y podrás cancelarlo.",
      },
      row: {
        saving: "Guardando…",
        save: "Guardar",
        cancel: "Cancelar",
        edit: "Modificar",
        delete: "Eliminar",
        deleteQ: "¿Eliminar?",
        cancelQ: "¿Cancelar?",
        yes: "Sí",
        no: "No",
        editAria: "Modificar la nota «%s»",
        deleteAria: "Eliminar la nota «%s»",
        confirmDeleteAria: "Confirmar la eliminación de la nota «%s»",
        cancelReminderAria: "Cancelar el recordatorio: %s",
        cancelReminderFallback: "Cancelar este recordatorio",
      },
    },
  },
};
