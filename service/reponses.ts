// Ce que Mayem répond. Chaque réponse est un modèle du tableur des locuteurs (packs/<langue>/finale/reponses.csv)
// rempli avec des valeurs mises en forme ici. Dans la langue nationale, la réponse passe par le moteur
// (core/moteur.ts) : elle ne s'affiche traduite que si une traduction validée existe, chiffres vérifiés ;
// sinon elle reste en français. Jamais de phrase composée.
// Un modèle dont le corpus a la traduction validée (même français, mêmes cases) est rempli directement, comme
// les versions par canal : le moteur ne reconnaît pas toujours une valeur à sa forme (un numéro de facture
// « 458221 » n'a pas la forme d'une référence).

import { memesChiffres } from '../core/faits.ts';
import { normaliser, traduire } from '../core/moteur.ts';
import type { Pack } from '../core/types.ts';

// Modèles de réponse et libellés de menus (« Électricité ») : tous viennent des tableurs des locuteurs
export interface Modele { ref: string; fr: string }
export interface Explication { ref: string; terme: string; explication_fr: string; exemple: string }
// Une réponse à dire : un modèle et ses valeurs, ou une ligne de faits (liste de contacts) qui ne se traduit pas.
// repli : une réponse plus simple déjà validée, dite à sa place tant que la première n'a pas de traduction validée ;
// une liste de lignes validées (récapitulatif ligne à ligne) ne s'affiche que si chacune est traduite.
// court : la même réponse en lignes validées plus courtes, pour un écran USSD (182 signes), tant que les locuteurs
// n'ont pas écrit sa version USSD
export type Morceau = { ref: string; valeurs?: Record<string, string>; prefixe?: string; repli?: Morceau | Morceau[]; court?: Morceau[] } | { fait: string };
export interface Rendu { ref: string; texte: string; langue: string; traduit: boolean }

// 85000 -> « 85 000 FCFA » : la forme que le moteur reconnaît comme un montant
export function montant(valeur: number): string {
  const entier = String(Math.round(Math.abs(valeur))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${valeur < 0 ? '-' : ''}${entier} FCFA`;
}
export const telephone = (numero: string) => numero.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
export const date = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
export const pourcentage = (taux: number) => `${String(Math.round(taux * 10000) / 100).replace('.', ',')} %`;

export interface Reponses { rendre(morceau: Morceau, langue: string, canal?: string): Rendu }
// Version validée d'une réponse pour un canal (USSD court, SMS, voix), tirée du tableur des réponses
export interface Variante { ref: string; canal: string; cible: string }

// fixes : traductions validées d'un texte entier sans case (explications des termes), par référence
export function creerReponses(modeles: Modele[], explications: Explication[], pack: Pack, variantes: Variante[] = [], fixes = new Map<string, string>()): Reponses {
  const parCanal = new Map(variantes.map((v) => [`${v.ref}|${v.canal}`, v.cible]));
  const textes = new Map<string, string>(modeles.map((m) => [m.ref, m.fr]));
  for (const e of explications) textes.set(e.ref, `${e.explication_fr} ${e.exemple}`.trim());
  const valideesParModele = new Map(pack.phrases.filter((p) => p.valide && p.cible && /\{\w+\}/.test(p.fr)).map((p) => [normaliser(p.fr), p.cible]));

  function remplir(ref: string, valeurs: Record<string, string> = {}): string {
    const modele = textes.get(ref);
    if (modele === undefined) throw new Error(`Réponse inconnue : ${ref}`);
    return modele.replace(/\{(\w+)\}/g, (_, champ: string) => {
      if (!(champ in valeurs)) throw new Error(`Réponse ${ref} : valeur {${champ}} absente`);
      return valeurs[champ];
    });
  }

  // Une traduction validée à cases (version par canal ou modèle du corpus), remplie avec les valeurs insérées ici :
  // mêmes cases que le modèle (vérifié à l'import), mêmes chiffres une fois remplie, sinon rien
  function remplirValidee(cible: string | undefined, francais: string, valeurs: Record<string, string> = {}): string | null {
    // Un nom ne prend jamais de chiffres, comme dans le moteur : un numéro n'entre pas dans une case {name}
    if (!cible || Object.entries(valeurs).some(([cle, v]) => cle.startsWith('name') && /\d/.test(v))) return null;
    const remplie = cible.replace(/\{(\w+)\}/g, (champ, nom: string) => valeurs[nom] ?? champ);
    return !/\{\w+\}/.test(remplie) && memesChiffres(francais, remplie) ? remplie : null;
  }

  function rendreModele(morceau: Exclude<Morceau, { fait: string }>, langue: string, canal?: string): Rendu {
    const francais = remplir(morceau.ref, morceau.valeurs);
    const prefixe = morceau.prefixe || '';
    if (langue === 'fr') return { ref: morceau.ref, texte: prefixe + francais, langue: 'fr', traduit: false };
    const fixe = fixes.get(morceau.ref);
    if (fixe && langue === pack.langue && memesChiffres(francais, fixe)) return { ref: morceau.ref, texte: prefixe + fixe, langue, traduit: true };
    const validee = langue !== pack.langue ? null
      : remplirValidee(canal ? parCanal.get(`${morceau.ref}|${canal}`) : undefined, francais, morceau.valeurs)
        ?? remplirValidee(valideesParModele.get(normaliser(textes.get(morceau.ref)!)), francais, morceau.valeurs);
    if (validee) return { ref: morceau.ref, texte: prefixe + validee, langue, traduit: true };
    const resultat = traduire(francais, pack);
    // Chaque valeur reprise par le moteur doit être exactement une valeur insérée ici : sinon une case du
    // modèle a pris un morceau de phrase, et la réponse reste en français plutôt que d'être mélangée
    const inserees = new Set(Object.values(morceau.valeurs || {}));
    const fidele = resultat?.valeurs.every((v) => inserees.has(v.trim()));
    return resultat && resultat.statut === 'ok' && resultat.sortie && fidele
      ? { ref: morceau.ref, texte: prefixe + resultat.sortie, langue, traduit: true }
      : { ref: morceau.ref, texte: prefixe + francais, langue: 'fr', traduit: false };
  }

  // Des lignes dites sous la référence de la réponse qu'elles remplacent : toutes traduites, ou toutes en français
  // quand le français est demandé ; sinon rien, jamais de mélange
  function assembler(ref: string, lignes: Rendu[], langue: string): Rendu | null {
    const traduit = langue !== 'fr';
    return lignes.every((l) => l.traduit === traduit) ? { ref, texte: lignes.map((l) => l.texte).join('\n'), langue, traduit } : null;
  }

  const reponses: Reponses = {
    rendre(morceau, langue, canal) {
      if ('fait' in morceau) return { ref: 'faits', texte: morceau.fait, langue: 'faits', traduit: false };
      const tous = (liste: Morceau[]) => assembler(morceau.ref, liste.map((m) => reponses.rendre(m, langue, canal)), langue);
      const court = canal === 'ussd' && morceau.court && !parCanal.has(`${morceau.ref}|ussd`) ? tous(morceau.court) : null;
      if (court) return court;
      const rendu = rendreModele(morceau, langue, canal);
      if (rendu.traduit || langue === 'fr' || !morceau.repli) return rendu;
      if (!Array.isArray(morceau.repli)) return reponses.rendre(morceau.repli, langue, canal);
      return tous(morceau.repli) || rendu;
    },
  };
  return reponses;
}
