// Forme d'un pack de langue (voir packs/schema.json) et des résultats du moteur.

export interface Phrase {
  id: string;
  fr: string;
  en: string[];
  bulu: string;
  critique: boolean;
  traduit_par: string;
  relu_par: string;
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
  version: string;
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
  id: string | null;
  categorie: Categorie | null;
}
