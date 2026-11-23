// Traduire ce qu'un service existant affiche, sans le modifier : un écran USSD, un message JSON d'une application
// mobile. Chaque texte passe par le moteur (core/moteur.ts) : il n'est remplacé que par une traduction validée,
// chiffres vérifiés ; sinon il reste tel que le service l'a écrit. Les valeurs (montants, références, numéros)
// ne sont jamais touchées.

import { traduire } from '../core/moteur.ts';
import type { Pack } from '../core/types.ts';

export interface Bilan { traduits: number; conserves: number }

export function traduireTexte(texte: string, pack: Pack | null, bilan: Bilan = { traduits: 0, conserves: 0 }): string {
  if (!pack || !texte.trim()) return texte;
  const resultat = traduire(texte, pack);
  if (resultat && resultat.statut === 'ok' && resultat.sortie) { bilan.traduits++; return resultat.sortie; }
  if (resultat) bilan.conserves++;
  return texte;
}

// Un écran de menu : chaque ligne à part, le numéro du choix (« 1. ») gardé tel quel
export function traduireEcran(ecran: string, pack: Pack | null, bilan: Bilan = { traduits: 0, conserves: 0 }): string {
  return ecran.split('\n').map((ligne) => {
    const [, numero, reste] = ligne.match(/^(\s*\d{1,2}\s*[.):-]\s*)(.*)$/) || ['', '', ligne];
    return numero + traduireTexte(reste, pack, bilan);
  }).join('\n');
}

// Un message JSON : toutes les chaînes, sauf celles des clés protégées (identifiants, références, numéros…)
export function traduireJson(valeur: unknown, pack: Pack | null, proteges: Set<string>, bilan: Bilan = { traduits: 0, conserves: 0 }): unknown {
  if (typeof valeur === 'string') return traduireTexte(valeur, pack, bilan);
  if (Array.isArray(valeur)) return valeur.map((v) => traduireJson(v, pack, proteges, bilan));
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([cle, v]) => [cle, proteges.has(cle) ? v : traduireJson(v, pack, proteges, bilan)]));
  }
  return valeur;
}
