// La langue d'une demande, quand le canal ne la dit pas : on compte les mots qui n'appartiennent qu'au vocabulaire
// validé d'une seule langue (un mot commun aux deux, comme « opération », ne dit rien). Dans le doute, aucun mot
// propre ou autant d'un côté que de l'autre, la réponse est null : l'appelant garde la langue qu'il a.

import { normaliser } from './comprendre.ts';

// Langue -> mots, écrits comme normaliser les écrit (minuscules, sans accents)
export type Vocabulaires = Map<string, Set<string>>;

// minimum : mots propres nécessaires ; sansAutre : aucun mot propre à une autre langue (pour changer de langue en
// cours de conversation, un mot isolé comme « oui » ne suffit pas). ignorer : noms des contacts, qui n'ont pas de langue.
export interface Prudence { minimum?: number; sansAutre?: boolean; ignorer?: Set<string> }

export const motsDe = (texte: string): string[] =>
  normaliser(texte).split(' ').filter((mot) => mot.length >= 2 && !/\d/.test(mot));

export function langueProbable(texte: string, vocabulaires: Vocabulaires, { minimum = 1, sansAutre = false, ignorer }: Prudence = {}): string | null {
  const compte = new Map<string, number>([...vocabulaires.keys()].map((langue) => [langue, 0]));
  for (const mot of new Set(motsDe(texte))) {
    if (ignorer?.has(mot)) continue;
    const langues = [...vocabulaires].filter(([, mots]) => mots.has(mot)).map(([langue]) => langue);
    if (langues.length === 1) compte.set(langues[0], compte.get(langues[0])! + 1);
  }
  const [premiere, ...autres] = [...compte].sort((a, b) => b[1] - a[1]);
  if (!premiere || premiere[1] < minimum) return null;
  const meilleureAutre = autres[0]?.[1] ?? 0;
  return premiere[1] > meilleureAutre && (!sansAutre || meilleureAutre === 0) ? premiere[0] : null;
}
