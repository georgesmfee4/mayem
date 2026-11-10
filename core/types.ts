// Forme d'un pack de langue (voir packs/schema.json) et des résultats du moteur.

export interface Phrase {
  id: string;
  fr: string;
  en: string[];
  bulu: string;
  critique: boolean;
  traduit_par: string;
  relu_par: string;
  // Une troisième personne relit le bulu sans voir le français et le retraduit
  retraduit_par: string;
  retraduction: string;
  valide: boolean;
}

export interface Terme {
  ref: string;
  terme: string;
  sens: string;
  en: string;
  bulu: string;
  critique: boolean;
  a_eviter: string;
  traduit_par: string;
  relu_par: string;
  commentaire: string;
}

export type Categorie = 'securite' | 'erreur' | 'frais' | 'info';

export interface Pack {
  langue: string;
  nom: string;
  // Augmentée par tools/build-pack.js à chaque changement ; date du changement (AAAA-MM-JJ)
  version: string;
  date: string;
  empreinte: string;
  orthographe: string;
  // Catégorie d'un message inédit -> id de la phrase qui sert d'étiquette
  etiquettes: Partial<Record<Categorie, string>>;
  glossaire: Terme[];
  phrases: Phrase[];
}

export interface Options {
  // Mode test : tant que le bulu n'est pas validé, affiche « ‹bu› + français »
  test?: boolean;
}

// ok : bulu validé · test : mode test · non_verifie : original conservé
// rejete : la sortie aurait changé un chiffre ou laissé un champ vide
export type Statut = 'ok' | 'test' | 'non_verifie' | 'rejete';

export interface Resultat {
  statut: Statut;
  critique: boolean;
  sortie: string | null;
  // Plusieurs phrases du corpus réunies : leurs id joints par « + » (E05+E07)
  id: string | null;
  categorie: Categorie | null;
  // Valeurs reprises telles quelles (montants, noms…) : la page ne doit jamais les déplacer
  valeurs: string[];
}
