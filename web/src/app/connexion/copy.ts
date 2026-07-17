// Textes de la connexion en FR/EN/ES — formulaire et page « à fixer ».
// Même structure dans les trois langues : une langue incomplète ne compile pas.

import { Language } from "@/lib/language";

export type ConnexionCopy = {
  title: string;
  subtitle: string;
  previousFailed: string;
  oauthStartFailed: string;
  sendFailed: string;
  wrongCode: string;
  continueWith: string; // "%s" = nom du fournisseur
  redirecting: string;
  comingSoonBadge: string;
  codeSignIn: string;
  orByEmail: string;
  sentTitle: string;
  sentCodeBefore: string; // … <strong>email</strong> …
  sentCodeAfter: string;
  sentLinkBefore: string;
  sentLinkAfter: string;
  codeLabel: string;
  validateCode: string;
  verifying: string;
  changeAddress: string;
  emailLabel: string;
  emailPlaceholder: string;
  sending: string;
  submitWithCode: string;
  submitLinkOnly: string;
  outlookNote: string;
  bientot: { fallbackName: string; codeName: string; body: string; back: string };
};

export const CONNEXION: Record<Language, ConnexionCopy> = {
  fr: {
    title: "Se connecter",
    subtitle: "Choisis ta méthode. Première visite ? Ton compte se crée tout seul.",
    previousFailed:
      "La connexion précédente n'a pas abouti (lien expiré, déjà utilisé, ou refusée par le fournisseur). Réessaie ci-dessous.",
    oauthStartFailed: "La connexion n'a pas pu démarrer. Réessaie dans un instant.",
    sendFailed: "L'envoi a échoué. Vérifie l'adresse et réessaie.",
    wrongCode: "Code incorrect ou expiré. Vérifie les 6 chiffres, ou demande un nouvel envoi.",
    continueWith: "Continuer avec %s",
    redirecting: "Redirection…",
    comingSoonBadge: "à fixer",
    codeSignIn: "Connexion par code à 6 chiffres",
    orByEmail: "ou par e-mail",
    sentTitle: "C'est envoyé 📬",
    sentCodeBefore: "Ouvre l'e-mail reçu à ",
    sentCodeAfter: ". Saisis le code à 6 chiffres ci-dessous, ou clique simplement le lien.",
    sentLinkBefore: "Ouvre l'e-mail reçu à ",
    sentLinkAfter: " et clique sur le lien pour continuer.",
    codeLabel: "Code à 6 chiffres",
    validateCode: "Valider le code",
    verifying: "Vérification…",
    changeAddress: "Changer d'adresse ou renvoyer",
    emailLabel: "Adresse e-mail",
    emailPlaceholder: "prenom@exemple.fr",
    sending: "Envoi…",
    submitWithCode: "Recevoir mon lien et mon code",
    submitLinkOnly: "Recevoir mon lien de connexion",
    outlookNote:
      "L'e-mail n'arrive pas, ou le lien ne s'ouvre pas ? Certains services (Outlook…) bloquent les liens de connexion. Essaie plutôt un des boutons plus haut.",
    bientot: {
      fallbackName: "Cette connexion",
      codeName: "La connexion par code à 6 chiffres",
      body: "Cette méthode n'est pas encore en service. En attendant, connecte-toi par e-mail avec le lien reçu : il fonctionne déjà.",
      back: "Revenir à la connexion",
    },
  },
  en: {
    title: "Sign in",
    subtitle: "Pick your method. First visit? Your account creates itself.",
    previousFailed:
      "The previous sign-in didn't go through (link expired, already used, or refused by the provider). Try again below.",
    oauthStartFailed: "The sign-in couldn't start. Try again in a moment.",
    sendFailed: "Sending failed. Check the address and try again.",
    wrongCode: "Wrong or expired code. Check the 6 digits, or request a new email.",
    continueWith: "Continue with %s",
    redirecting: "Redirecting…",
    comingSoonBadge: "coming soon",
    codeSignIn: "Sign in with a 6-digit code",
    orByEmail: "or by email",
    sentTitle: "It's sent 📬",
    sentCodeBefore: "Open the email received at ",
    sentCodeAfter: ". Enter the 6-digit code below, or simply click the link.",
    sentLinkBefore: "Open the email received at ",
    sentLinkAfter: " and click the link to continue.",
    codeLabel: "6-digit code",
    validateCode: "Confirm the code",
    verifying: "Checking…",
    changeAddress: "Change address or resend",
    emailLabel: "Email address",
    emailPlaceholder: "name@example.com",
    sending: "Sending…",
    submitWithCode: "Get my link and my code",
    submitLinkOnly: "Get my sign-in link",
    outlookNote:
      "Email not arriving, or the link won't open? Some services (Outlook…) block sign-in links. Try one of the buttons above instead.",
    bientot: {
      fallbackName: "This sign-in method",
      codeName: "Signing in with a 6-digit code",
      body: "This method isn't in service yet. In the meantime, sign in by email with the link you receive: that one already works.",
      back: "Back to sign-in",
    },
  },
  es: {
    title: "Iniciar sesión",
    subtitle: "Elige tu método. ¿Primera visita? Tu cuenta se crea sola.",
    previousFailed:
      "La conexión anterior no llegó a completarse (enlace caducado, ya usado, o rechazada por el proveedor). Inténtalo de nuevo abajo.",
    oauthStartFailed: "La conexión no pudo empezar. Inténtalo en un momento.",
    sendFailed: "El envío ha fallado. Revisa la dirección e inténtalo de nuevo.",
    wrongCode: "Código incorrecto o caducado. Revisa las 6 cifras, o pide un nuevo envío.",
    continueWith: "Continuar con %s",
    redirecting: "Redirigiendo…",
    comingSoonBadge: "próximamente",
    codeSignIn: "Entrar con un código de 6 cifras",
    orByEmail: "o por correo",
    sentTitle: "Enviado 📬",
    sentCodeBefore: "Abre el correo recibido en ",
    sentCodeAfter: ". Escribe abajo el código de 6 cifras, o simplemente haz clic en el enlace.",
    sentLinkBefore: "Abre el correo recibido en ",
    sentLinkAfter: " y haz clic en el enlace para continuar.",
    codeLabel: "Código de 6 cifras",
    validateCode: "Validar el código",
    verifying: "Comprobando…",
    changeAddress: "Cambiar de dirección o reenviar",
    emailLabel: "Dirección de correo",
    emailPlaceholder: "nombre@ejemplo.es",
    sending: "Enviando…",
    submitWithCode: "Recibir mi enlace y mi código",
    submitLinkOnly: "Recibir mi enlace de conexión",
    outlookNote:
      "¿No llega el correo, o el enlace no se abre? Algunos servicios (Outlook…) bloquean los enlaces de conexión. Prueba mejor uno de los botones de arriba.",
    bientot: {
      fallbackName: "Este método de conexión",
      codeName: "La conexión con código de 6 cifras",
      body: "Este método aún no está en servicio. Mientras tanto, entra por correo con el enlace recibido: ese ya funciona.",
      back: "Volver a la conexión",
    },
  },
};
