// Le contexte du noyau assemblé à partir de données déjà lues : pack validé, modèles de réponse, versions par canal,
// explications, vocabulaires. tools/conversation.js les lit dans le dépôt ; un hébergeur sans fichiers (Cloudflare)
// les reçoit embarquées. Rien ici ne lit de fichier ni n'appelle le réseau.

import type { Lexique, Terme } from '../core/comprendre.ts';
import type { Pack } from '../core/types.ts';
import type { Banque } from './banque.ts';
import type { Contexte } from './conversation.ts';
import { creerReponses, type Explication, type Modele, type Variante } from './reponses.ts';

export interface DonneesContexte {
  pack: Pack;
  modeles: Modele[];
  explications: Explication[];
  variantes: Variante[];
  // Explications validées en langue nationale, par référence
  fixes: [string, string][];
  lexiques: Lexique[];
  termes: Terme[];
  nationale: { code: string; nom: string };
  typesFacture: { type: string; ref: string }[];
  vocabulaires: [string, string[]][];
  // Écriture des lettres absentes de l'alphabet des téléphones simples, décidée par les locuteurs
  gsm7?: [string, string][];
  // Textes validés qui gardent leurs accents sur ce canal : sans eux, ils se confondraient avec un autre
  gsm7Gardes?: string[];
}

export function contexteDepuis(d: DonneesContexte, banque: Banque): Contexte {
  return {
    banque,
    reponses: creerReponses(d.modeles, d.explications, d.pack, d.variantes, new Map(d.fixes)),
    lexiques: d.lexiques,
    termes: d.termes,
    nationale: d.nationale,
    typesFacture: d.typesFacture,
    vocabulaires: new Map(d.vocabulaires.map(([langue, mots]) => [langue, new Set(mots)])),
    gsm7: new Map(d.gsm7 || []),
    gsm7Gardes: new Set(d.gsm7Gardes || []),
  };
}
