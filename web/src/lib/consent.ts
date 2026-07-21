// Registre de consentement : le chemin serveur du grant « appelant de
// confiance » (lecture pendant l'appel, écriture depuis le tableau de bord).
//
// Le grant est durable, mais il n'est mis en cache NULLE PART : ni dans le
// prompt de l'assistant, ni en mémoire de processus, ni dans une session. Il est
// relu dans la base à chaque lot d'appels d'outils. C'est ce qui rend la
// révocation vraie plutôt que promise : la vue current_caller_consents ne rend
// que la dernière ligne écrite, donc un refus posé depuis le tableau de bord
// vaut dès la lecture suivante, y compris pendant un appel en cours.

import { supabaseAdmin } from "./supabase/admin";

// La source du registre pour ce grant. Elle vit à côté des six sources globales
// (calendar, contacts, sms, outbound_calls, memory, recording) mais elle est
// portée par un sujet : consents.subject = le numéro visé.
export const TRUSTED_CALLER_SOURCE = "trusted_caller";

// Ce numéro a-t-il un grant en cours sur ce compte ?
//
// Fail-closed de bout en bout : pas de compte, numéro masqué, base muette ou
// migration 0014 pas encore appliquée redonnent un appelant ordinaire. Le coût
// d'une erreur est alors une friction (le code jetable reprend la main), jamais
// une donnée ouverte à qui affiche le bon numéro.
export async function callerIsTrusted(userId: string | null, e164: string | null): Promise<boolean> {
  if (!userId || !e164) return false;
  // On lit la VUE, pas la table. Le registre est append-only : la table contient
  // aussi les grants révoqués, et y piocher une ligne au hasard ressusciterait
  // un consentement retiré. La vue tranche par date, une fois, au bon endroit.
  const { data, error } = await supabaseAdmin()
    .from("current_caller_consents")
    .select("granted")
    .eq("user_id", userId)
    .eq("source", TRUSTED_CALLER_SOURCE)
    .eq("subject", e164)
    .maybeSingle();
  if (error) {
    console.error("Lecture du grant appelant de confiance", error);
    return false;
  }
  return data?.granted === true;
}

// Poser ou retirer le grant. Renvoie false si rien n'a été écrit.
//
// Le numéro arrive d'un formulaire, donc d'un POST que rien n'empêche de
// fabriquer à la main (les Server Actions sont joignables directement). On ne
// lui fait aucune confiance : il doit correspondre à une ligne phones de CE
// compte, et vérifiée. Sans cette relecture, il suffirait d'un champ caché
// modifié pour déclarer de confiance un numéro qui n'est pas le sien, et le
// grant serait exactement l'inverse de ce qu'il annonce.
//
// C'est aussi ce qui tient la promesse « première fois = code jetable » : un
// numéro non vérifié n'a pas de grant possible, donc son premier appel passe par
// le code comme n'importe quel autre.
export async function recordCallerTrust(
  userId: string,
  e164: string,
  granted: boolean,
  scopeNote: string,
): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: phone } = await db
    .from("phones")
    .select("e164")
    .eq("user_id", userId)
    .eq("e164", e164)
    .not("verified_at", "is", null)
    .maybeSingle();
  if (!phone) return false;

  // Append-only : révoquer, c'est insérer granted=false. On n'écrase ni
  // n'efface la ligne d'origine, la personne garde la trace de ses deux choix.
  const { error } = await db.from("consents").insert({
    user_id: userId,
    source: TRUSTED_CALLER_SOURCE,
    subject: phone.e164,
    granted,
    scope_note: scopeNote,
  });
  if (error) {
    console.error("Écriture du grant appelant de confiance", error);
    return false;
  }
  return true;
}
