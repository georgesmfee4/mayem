// Ce que Mayem répond. Chaque réponse est un modèle du tableur des locuteurs (packs/<langue>/finale/reponses.csv)
// rempli avec des valeurs mises en forme ici. Dans la langue nationale, la réponse passe par le moteur
// (core/moteur.ts) : elle ne s'affiche traduite que si une traduction validée existe, chiffres vérifiés ;
// sinon elle reste en français. Jamais de phrase composée.

import { traduire } from '../core/moteur.ts';
import type { Pack } from '../core/types.ts';

// Modèles de réponse et libellés de menus (« Électricité ») : tous viennent des tableurs des locuteurs
export interface Modele { ref: string; fr: string }
export interface Explication { ref: string; terme: string; explication_fr: string; exemple: string }
// Une réponse à dire : un modèle et ses valeurs, ou une ligne de faits (liste de contacts) qui ne se traduit pas
export type Morceau = { ref: string; valeurs?: Record<string, string>; prefixe?: string } | { fait: string };
export interface Rendu { ref: string; texte: string; langue: string; traduit: boolean }

// 85000 -> « 85 000 FCFA » : la forme que le moteur reconnaît comme un montant
export function montant(valeur: number): string {
  const entier = String(Math.round(Math.abs(valeur))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${valeur < 0 ? '-' : ''}${entier} FCFA`;
}
export const telephone = (numero: string) => numero.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
export const date = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
export const pourcentage = (taux: number) => `${String(Math.round(taux * 10000) / 100).replace('.', ',')} %`;

export interface Reponses { rendre(morceau: Morceau, langue: string): Rendu }

export function creerReponses(modeles: Modele[], explications: Explication[], pack: Pack): Reponses {
  const textes = new Map<string, string>(modeles.map((m) => [m.ref, m.fr]));
  for (const e of explications) textes.set(e.ref, `${e.explication_fr} ${e.exemple}`.trim());

  function remplir(ref: string, valeurs: Record<string, string> = {}): string {
    const modele = textes.get(ref);
    if (modele === undefined) throw new Error(`Réponse inconnue : ${ref}`);
    return modele.replace(/\{(\w+)\}/g, (_, champ: string) => {
      if (!(champ in valeurs)) throw new Error(`Réponse ${ref} : valeur {${champ}} absente`);
      return valeurs[champ];
    });
  }

  return {
    rendre(morceau, langue) {
      if ('fait' in morceau) return { ref: 'faits', texte: morceau.fait, langue: 'faits', traduit: false };
      const francais = remplir(morceau.ref, morceau.valeurs);
      const prefixe = morceau.prefixe || '';
      if (langue === 'fr') return { ref: morceau.ref, texte: prefixe + francais, langue: 'fr', traduit: false };
      const resultat = traduire(francais, pack);
      // Chaque valeur reprise par le moteur doit être exactement une valeur insérée ici : sinon une case du
      // modèle a pris un morceau de phrase, et la réponse reste en français plutôt que d'être mélangée
      const inserees = new Set(Object.values(morceau.valeurs || {}));
      const fidele = resultat?.valeurs.every((v) => inserees.has(v.trim()));
      return resultat && resultat.statut === 'ok' && resultat.sortie && fidele
        ? { ref: morceau.ref, texte: prefixe + resultat.sortie, langue, traduit: true }
        : { ref: morceau.ref, texte: prefixe + francais, langue: 'fr', traduit: false };
    },
  };
}
