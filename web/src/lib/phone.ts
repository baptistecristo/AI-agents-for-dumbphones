// Validation E.164 : un « + » suivi d'un indicatif pays (1-9) puis 6 à 14
// chiffres. Sert de garde avant tout envoi/appel : on ne compose que des numéros
// bien formés, jamais une chaîne libre venue du LLM.
export const isE164 = (s: string): boolean => /^\+[1-9]\d{6,14}$/.test(s);
