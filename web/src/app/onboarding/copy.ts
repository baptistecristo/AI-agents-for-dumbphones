// Textes de l'onboarding en FR/EN/ES. Les libellés de consentement vivent ici :
// c'est CE texte que la personne coche, et c'est lui qui part en scope_note —
// le registre garde donc la phrase réellement montrée, dans sa langue.

import { Language } from "@/lib/language";

export const CONSENT_SOURCES = [
  "calendar",
  "contacts",
  "sms",
  "outbound_calls",
  "memory",
  "recording",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export type OnboardingCopy = {
  phone: {
    title: string;
    body: string;
    fullName: string;
    preferredName: string;
    address: string;
    addressPlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    sending: string;
    sendCode: string;
    skip: string;
    codeSentTo: string; // "%s" = numéro
    codeLabel: string;
    verifying: string;
    verify: string;
    continue: string;
  };
  google: { title: string; body: string; connect: string; skip: string };
  consents: {
    title: string;
    body: string;
    save: string;
    labels: Record<ConsentSource, string>;
    defaults: Record<ConsentSource, boolean>;
  };
  errors: {
    invalidNumber: string;
    sendFailed: string;
    codeSent: string;
    wrongCode: string;
    verifyFailed: string;
    verified: string;
  };
};

const CONSENT_DEFAULTS: Record<ConsentSource, boolean> = {
  calendar: true,
  contacts: true,
  sms: true,
  outbound_calls: true,
  memory: true,
  recording: false,
};

export const ONBOARDING: Record<Language, OnboardingCopy> = {
  fr: {
    phone: {
      title: "Le téléphone à relier",
      body: "C'est le numéro depuis lequel tu appelleras ton assistant. Un code de vérification arrive par SMS.",
      fullName: "Nom complet",
      preferredName: "Comment l'assistant doit t'appeler",
      address: "Ton adresse (pour les itinéraires depuis « chez moi »)",
      addressPlaceholder: "12 rue des Lilas, 75011 Paris",
      phoneLabel: "Numéro du téléphone (le dumbphone)",
      phonePlaceholder: "06 12 34 56 78",
      sending: "Envoi…",
      sendCode: "Envoyer le code de vérification",
      skip: "Passer pour l'instant (pas de téléphone à relier)",
      codeSentTo: "Code envoyé au %s. Saisis-le ci-dessous.",
      codeLabel: "Code reçu par SMS",
      verifying: "Vérification…",
      verify: "Vérifier",
      continue: "Continuer →",
    },
    google: {
      title: "Connecter l'agenda et les contacts",
      body: "En connectant ton compte Google, l'assistant pourra lire et gérer tes rendez-vous et retrouver tes contacts. Les accès sont chiffrés et révocables à tout moment.",
      connect: "Connecter mon compte Google",
      skip: "Passer pour l'instant",
    },
    consents: {
      title: "Ce que l'assistant a le droit de faire",
      body: "Chaque autorisation est enregistrée, horodatée et révocable. C'est toi qui décides.",
      save: "Enregistrer mes choix",
      labels: {
        calendar: "Lire et modifier l'agenda",
        contacts: "Lire les contacts",
        sms: "Envoyer des SMS (rappels, itinéraires, comptes-rendus)",
        outbound_calls: "Passer des appels à ma place (restaurant, taxi, rendez-vous)",
        memory: "Retenir mes préférences (lieux, personnes, habitudes)",
        recording: "Enregistrer et transcrire les appels pour le suivi",
      },
      defaults: CONSENT_DEFAULTS,
    },
    errors: {
      invalidNumber: "Numéro invalide. Exemple : 06 12 34 56 78",
      sendFailed: "Impossible d'envoyer le code (service SMS). Réessaie.",
      codeSent: "Code envoyé par SMS.",
      wrongCode: "Code incorrect. Réessaie.",
      verifyFailed: "Vérification impossible. Redemande un code.",
      verified: "Numéro vérifié ✅",
    },
  },
  en: {
    phone: {
      title: "The phone to link",
      body: "This is the number you'll call your assistant from. A verification code arrives by SMS.",
      fullName: "Full name",
      preferredName: "What the assistant should call you",
      address: "Your address (for directions from \"home\")",
      addressPlaceholder: "12 rue des Lilas, 75011 Paris",
      phoneLabel: "Phone number (the dumbphone)",
      phonePlaceholder: "+33 6 12 34 56 78",
      sending: "Sending…",
      sendCode: "Send the verification code",
      skip: "Skip for now (no phone to link)",
      codeSentTo: "Code sent to %s. Enter it below.",
      codeLabel: "Code received by SMS",
      verifying: "Checking…",
      verify: "Verify",
      continue: "Continue →",
    },
    google: {
      title: "Connect calendar and contacts",
      body: "By connecting your Google account, the assistant can read and manage your appointments and find your contacts. Access is encrypted and revocable at any time.",
      connect: "Connect my Google account",
      skip: "Skip for now",
    },
    consents: {
      title: "What the assistant is allowed to do",
      body: "Every permission is recorded, timestamped and revocable. You decide.",
      save: "Save my choices",
      labels: {
        calendar: "Read and edit the calendar",
        contacts: "Read contacts",
        sms: "Send SMS (reminders, directions, reports)",
        outbound_calls: "Place calls on my behalf (restaurant, taxi, appointments)",
        memory: "Remember my preferences (places, people, habits)",
        recording: "Record and transcribe calls for follow-up",
      },
      defaults: CONSENT_DEFAULTS,
    },
    errors: {
      invalidNumber: "Invalid number. Example: +33 6 12 34 56 78",
      sendFailed: "Couldn't send the code (SMS service). Try again.",
      codeSent: "Code sent by SMS.",
      wrongCode: "Wrong code. Try again.",
      verifyFailed: "Verification impossible. Request a new code.",
      verified: "Number verified ✅",
    },
  },
  es: {
    phone: {
      title: "El teléfono que vincular",
      body: "Es el número desde el que llamarás a tu asistente. Un código de verificación llega por SMS.",
      fullName: "Nombre completo",
      preferredName: "Cómo debe llamarte el asistente",
      address: "Tu dirección (para las rutas desde «mi casa»)",
      addressPlaceholder: "Calle Mayor 12, 28013 Madrid",
      phoneLabel: "Número del teléfono (el dumbphone)",
      phonePlaceholder: "+34 612 34 56 78",
      sending: "Enviando…",
      sendCode: "Enviar el código de verificación",
      skip: "Saltar por ahora (sin teléfono que vincular)",
      codeSentTo: "Código enviado al %s. Escríbelo abajo.",
      codeLabel: "Código recibido por SMS",
      verifying: "Comprobando…",
      verify: "Verificar",
      continue: "Continuar →",
    },
    google: {
      title: "Conectar la agenda y los contactos",
      body: "Al conectar tu cuenta de Google, el asistente podrá leer y gestionar tus citas y encontrar tus contactos. Los accesos están cifrados y son revocables en cualquier momento.",
      connect: "Conectar mi cuenta de Google",
      skip: "Saltar por ahora",
    },
    consents: {
      title: "Lo que el asistente tiene permitido hacer",
      body: "Cada autorización queda registrada, con fecha y hora, y es revocable. Tú decides.",
      save: "Guardar mis elecciones",
      labels: {
        calendar: "Leer y modificar la agenda",
        contacts: "Leer los contactos",
        sms: "Enviar SMS (recordatorios, rutas, resúmenes)",
        outbound_calls: "Hacer llamadas en mi nombre (restaurante, taxi, citas)",
        memory: "Recordar mis preferencias (lugares, personas, costumbres)",
        recording: "Grabar y transcribir las llamadas para el seguimiento",
      },
      defaults: CONSENT_DEFAULTS,
    },
    errors: {
      invalidNumber: "Número no válido. Ejemplo: +34 612 34 56 78",
      sendFailed: "No se pudo enviar el código (servicio SMS). Inténtalo de nuevo.",
      codeSent: "Código enviado por SMS.",
      wrongCode: "Código incorrecto. Inténtalo de nuevo.",
      verifyFailed: "Verificación imposible. Pide otro código.",
      verified: "Número verificado ✅",
    },
  },
};
