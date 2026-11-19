// Forme d'un pack de langue (voir packs/schema.json) et des résultats du moteur.

export interface Phrase {
  id: string;
  fr: string;
  en: string[];
  cible: string;
  critique: boolean;
  traduit_par: string;
  relu_par: string;
  // Une troisième personne relit la traduction sans voir le français et le retraduit
  retraduit_par: string;
  retraduction: string;
  valide: boolean;
  // Autres formulations françaises de la même phrase, vérifiées par un francophone de l'équipe :
  // elles mènent à la même traduction validée (niveau 3, core/sens.ts)
  variantes?: string[];
}

export interface Terme {
  ref: string;
  terme: string;
  sens: string;
  en: string;
  cible: string;
  critique: boolean;
  a_eviter: string;
  traduit_par: string;
  relu_par: string;
  commentaire: string;
}

export type Categorie = 'securite' | 'erreur' | 'frais' | 'info';

export interface Pack {
  // 2 : la traduction est dans « cible » (packs/schema.json)
  format: number;
  langue: string;
  nom: string;
  // Augmentée par tools/build-pack.js à chaque changement ; date du changement (AAAA-MM-JJ)
  version: string;
  date: string;
  empreinte: string;
  // Titulaire des droits et conditions d'utilisation (facultatifs)
  producteur?: string;
  droits?: string;
  orthographe: string;
  // Catégorie d'un message inédit -> id de la phrase qui sert d'étiquette
  etiquettes: Partial<Record<Categorie, string>>;
  glossaire: Terme[];
  phrases: Phrase[];
  // Posée à la publication sur l'API (tools/api.js) : clé de l'équipe Mayem et signature de l'empreinte
  signature?: { cle: string; valeur: string };
}

export interface Options {
  // Mode test : tant que la traduction n'est pas validée, affiche « ‹…› + français »
  test?: boolean;
}

// ok : traduction validée · test : mode test · non_verifie : original conservé
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
  // reconnu : au moins une phrase n'est pas dans le corpus mais dit exactement la même chose
  // qu'une phrase validée, dont la traduction est affichée (niveau 3, core/sens.ts)
  sens?: 'reconnu';
  // Phrase inconnue : termes validés du glossaire qu'elle contient, à signaler sans traduire la phrase
  termes?: { ref: string; fr: string; traduction: string; critique: boolean }[];
}
