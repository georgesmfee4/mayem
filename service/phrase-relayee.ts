// Une phrase écrite à la place d'une touche, devant un service USSD relayé. Le noyau conversationnel la comprend et
// pose ses questions (contact, homonymes, montant) avec les mêmes réponses validées que sur les autres canaux ; quand
// l'opération est complète, elle devient le chemin de touches que le service attend (raccourcis du profil), et c'est
// le service qui récapitule, fait confirmer et exécute. Au service ne part qu'une opération complète ou une touche
// de son propre écran. Personne ne reste bloqué : une touche de menu tapée pendant une question de Mayem revient au
// service, « annuler » abandonne, et trois réponses sans suite font abandonner la question.

import { comprendre, type Comprehension } from '../core/comprendre.ts';
import type { Operation } from '../core/operation.ts';
import { nouvelleSession, traiter, type Contexte, type Session, type Tour } from './conversation.ts';

export interface Phrase {
  ctx: Contexte;
  raccourcis: Record<string, string[]>;
  // L'écran que le service vient d'afficher, pour « oui » et « non » à sa question
  ecran: string;
  appelant: string;
}

export type Suite =
  | { choix: true; comprise: Comprehension }
  | { langue: string; comprise: Comprehension }
  | { question: string; tour: Tour }
  | { message: string; tour?: Tour; comprise: Comprehension }
  | { chemin: string[]; tour?: Tour; comprise: Comprehension }
  | { touches: string[]; comprise: Comprehension };

const ARGENT = new Set(['transfert', 'credit', 'facture']);
// Ce que le noyau sait dire sans interroger la banque : le reste vient des écrans du service
const SANS_BANQUE = new Set(['aide', 'expliquer', 'terminer']);
// « 1. Confirmer », « 2) Annuler » : la touche à laquelle « oui » ou « non » répond sur l'écran du service
const LIGNE_OUI = /^\s*(\d{1,2})\s*[.):-]\s*(confirmer|valider|accepter|oui)\b/im;
const LIGNE_NON = /^\s*(\d{1,2})\s*[.):-]\s*(annuler|refuser|non)\b/im;

export const sessionRelayee = (id: string, langue: string, appelant: string): Session => ({ ...nouvelleSession(id, 'ussd', langue), relais: { appelant } });

// L'opération complète, écrite dans le chemin de touches que le service attend
function cheminDe(raccourcis: Record<string, string[]>, operation: Operation): string[] | null {
  const touches = raccourcis[operation.intention];
  if (!touches) return null;
  return touches.map((t) => t.replace('{montant}', String(operation.montant)).replace('{telephone}', operation.telephone || ''));
}

// Le tour du noyau, rendu à l'écran : une question seule, l'opération vers le service, ou une réponse au-dessus de
// l'écran du service
function suiteDe(p: Phrase, tour: Tour, c: Comprehension): Suite {
  if (tour.pret) {
    const chemin = cheminDe(p.raccourcis, tour.pret);
    return chemin ? { chemin, tour, comprise: c } : { message: tour.texte, tour, comprise: c };
  }
  if (tour.journal.statut === 'clarification') return { question: tour.texte, tour };
  return { message: tour.texte, tour, comprise: c };
}

const dire = (p: Phrase, session: Session, ref: string) => p.ctx.reponses.rendre({ ref }, session.langue, 'ussd').texte;

// incomprises : phrases de suite que Mayem n'a pas comprises, pour aider davantage la deuxième fois
export async function lirePhrase(p: Phrase, session: Session, saisie: string, incomprises: number): Promise<Suite> {
  const c = comprendre(saisie, { lexiques: p.ctx.lexiques, carnet: await p.ctx.banque.carnet(), termes: p.ctx.termes });
  if (c.intention === 'langue') return c.langue ? { langue: c.langue === 'fr' ? 'fr' : p.ctx.nationale.code, comprise: c } : { choix: true, comprise: c };
  if (session.attente) {
    // Une touche de menu pendant une question sur un montant ou un bénéficiaire : la personne revient au service
    if (/^\d{1,2}$/.test(saisie.trim()) && (session.attente === 'montant' || session.attente === 'beneficiaire')) return { touches: [saisie.trim()], comprise: c };
    return suiteDe(p, await traiter(p.ctx, session, saisie), c);
  }
  const intention = c.intention || '';
  if (ARGENT.has(intention) || c.negation || c.hesitation.length) {
    if (ARGENT.has(intention) && !p.raccourcis[intention] && !c.negation) return { message: dire(p, session, 'RF110'), comprise: c };
    return suiteDe(p, await traiter(p.ctx, session, saisie), c);
  }
  const touches = p.raccourcis[intention];
  if (touches && touches.every((t) => !t.startsWith('{'))) return { chemin: touches, comprise: c };
  const ligne = intention === 'oui' ? LIGNE_OUI.exec(p.ecran) : intention === 'non' ? LIGNE_NON.exec(p.ecran) : null;
  if (ligne) return { touches: [ligne[1]], comprise: c };
  if (SANS_BANQUE.has(intention)) return suiteDe(p, await traiter(p.ctx, session, saisie), c);
  // Pas comprise : d'abord « pouvez-vous la dire autrement ? », la fois suivante ce que Mayem sait faire. Comprise mais
  // impossible sans les écrans du service : ce que Mayem sait faire.
  return { message: dire(p, session, !intention && incomprises === 0 ? 'RF056' : 'RF110'), comprise: c };
}
