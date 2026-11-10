// Moteur de traduction : phrase exacte -> modèle à trous -> catégorie -> repli sûr.
// Il ne connaît aucune page : il reçoit une chaîne et un pack, il rend un résultat.

import { MOTIFS, estPhrase, memesChiffres, queDesFaits } from './faits.ts';
import type { Categorie, Options, Pack, Phrase, Resultat, Statut } from './types.ts';

// Les champs {…} du corpus portent des noms anglais (amount_1, phone…) : c'est le format
// des fichiers envoyés aux traducteurs, on le garde tel quel.
const CHAMPS: Record<string, string> = {
  amount: MOTIFS.montant,
  percent: MOTIFS.pourcentage,
  date: MOTIFS.date,
  account: MOTIFS.compte,
  ref: MOTIFS.reference,
  phone: MOTIFS.telephone,
  code: MOTIFS.code,
};
const LIBRE = String.raw`[^\n]+?`;
const typeDeChamp = (nom: string) => nom.replace(/_\d+$/, ''); // amount_1 -> amount

export const normaliser = (s: string): string =>
  s.normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
export const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Le motif n'est compilé qu'au premier essai : compiler des milliers d'expressions Unicode coûte cher,
// et une page n'en essaie qu'une petite partie. mots : texte fixe du modèle, en minuscules.
interface Modele { source: string; motif?: RegExp; mots: string[]; phrase: Phrase; precision: number }
interface Index {
  exactes: Map<string, Phrase>;
  // Modèles rangés par leur premier mot : un texte n'essaie que ceux qui commencent comme lui,
  // plus ceux qui commencent par un champ. La recherche reste rapide avec des milliers de modèles.
  parMot: Map<string, Modele[]>;
  sansMot: Modele[];
  parId: Map<string, Phrase>;
}

// Premier mot en minuscules ; dans un modèle, un mot collé à un champ ({…}) ne compte pas
const premierMot = (texte: string, modele = false) =>
  texte.match(modele ? /^\p{L}+(?![\p{L}{])/u : /^\p{L}+(?!\p{L})/u)?.[0].toLowerCase() || '';
const plusPrecis = (a: Modele, b: Modele) => b.precision - a.precision;

// Chaque champ est capturé librement, puis validé par le motif de son type (montant, date…).
// Ces motifs Unicode coûtent cher à compiler : un seul exemplaire par type, partagé par tous les modèles.
function versRegex(source: string): RegExp {
  const corps = normaliser(source)
    .split(/(\{\w+\})/)
    .map((morceau) => {
      const champ = morceau.match(/^\{(\w+)\}$/);
      if (champ) return `(?<${champ[1]}>${LIBRE})`;
      return echapper(morceau).replace(/ /g, '\\s*');
    })
    .join('');
  return new RegExp(`^${corps}$`, 'iu');
}

const validateurs = new Map<string, RegExp>();
function champValide(nom: string, valeur: string): boolean {
  const type = typeDeChamp(nom);
  if (!CHAMPS[type]) return true;
  if (!validateurs.has(type)) validateurs.set(type, new RegExp(`^(?:${CHAMPS[type]})$`, 'iu'));
  return validateurs.get(type)!.test(valeur);
}

function indexer(pack: Pack): Index {
  const index: Index = { exactes: new Map(), parMot: new Map(), sansMot: [], parId: new Map() };
  for (const phrase of pack.phrases) {
    index.parId.set(phrase.id, phrase);
    for (const source of [phrase.fr, ...phrase.en]) {
      if (/\{\w+\}/.test(source)) {
        const precision = source.replace(/\{\w+\}/g, '').length;
        const fixe = normaliser(source).replace(/\{\w+\}/g, ' ').toLowerCase();
        const modele: Modele = { source, mots: fixe.split(' ').filter(Boolean), phrase, precision };
        const mot = premierMot(normaliser(source), true);
        if (mot) index.parMot.set(mot, [...(index.parMot.get(mot) || []), modele]);
        else index.sansMot.push(modele);
      } else {
        index.exactes.set(normaliser(source).toLowerCase(), phrase);
      }
    }
  }
  // Les modèles les plus précis d'abord
  index.sansMot.sort(plusPrecis);
  for (const liste of index.parMot.values()) liste.sort(plusPrecis);
  return index;
}

// Un pack est indexé une seule fois, puis réutilisé tant qu'il existe
const cache = new WeakMap<Pack, Index>();
function indexDe(pack: Pack): Index {
  let index = cache.get(pack);
  if (!index) cache.set(pack, (index = indexer(pack)));
  return index;
}

const remplir = (modele: string, valeurs: Record<string, string>) =>
  modele.replace(/\{(\w+)\}/g, (_, nom) => (valeurs[nom] !== undefined ? valeurs[nom] : `{${nom}}`));

function rendre(phrase: Phrase, valeurs: Record<string, string>, options: Options): { statut: Statut; sortie: string | null } {
  let statut: Statut = 'non_verifie';
  let sortie: string | null = null;
  if (phrase.valide && phrase.bulu) [statut, sortie] = ['ok', remplir(phrase.bulu, valeurs)];
  else if (options.test) [statut, sortie] = ['test', '‹…› ' + remplir(phrase.fr, valeurs)];
  return { statut, sortie };
}

// Catégorie d'un message inconnu : sert à afficher une étiquette validée
const CATEGORIES: [Categorie, RegExp][] = [
  ['securite', /s[ée]curit|security|code secret|secret code|\bpin\b|mot de passe|password|arnaque|fraud|scam|ne partagez|never share|do not share/i],
  ['erreur', /erreur|error|échec|echec|failed|invalide|invalid|insuffisant|insufficient|impossible|indisponible|unavailable|refus|declined/i],
  ['frais', /frais|\bfees?\b|commission|tarif|charges?\b/i],
];
export function categoriser(texte: string): Categorie {
  const trouvee = CATEGORIES.find(([, motif]) => motif.test(texte));
  return trouvee ? trouvee[0] : 'info';
}

// Étiquette à afficher pour une catégorie, ou null. Seules les catégories qui changent
// le comportement de l'utilisateur en ont une (le pack décide lesquelles) : un message
// neutre ne doit pas être présenté comme important.
export function etiquette(categorie: Categorie, pack: Pack, options: Options = {}): string | null {
  const id = pack.etiquettes[categorie];
  const phrase = id ? indexDe(pack).parId.get(id) : undefined;
  return phrase ? rendre(phrase, {}, options).sortie : null;
}

interface Trouve { phrase: Phrase; valeurs: Record<string, string> }

function chercher(texte: string, index: Index): Trouve | null {
  const exacte = index.exactes.get(texte.toLowerCase());
  if (exacte) return { phrase: exacte, valeurs: {} };
  const candidats = [...(index.parMot.get(premierMot(texte)) || []), ...index.sansMot].sort(plusPrecis);
  const bas = texte.toLowerCase();
  for (const modele of candidats) {
    // Filtre sans expression régulière : chaque mot fixe du modèle doit être dans le texte
    if (!modele.mots.every((mot) => bas.includes(mot))) continue;
    const trouve = texte.match((modele.motif ||= versRegex(modele.source)));
    const valeurs = trouve?.groups || {};
    if (trouve && Object.entries(valeurs).every(([nom, valeur]) => champValide(nom, valeur))) return { phrase: modele.phrase, valeurs };
  }
  return null;
}

// Fin de phrase suivie d'une majuscule : « 2.500 » n'est pas coupé (pas d'espace après le point)
const COUPURE = /(?<=[.!?…])\s+(?=[\p{Lu}«"])/u;

interface Morceau { texte: string; trouve: Trouve | null }

// Message entier, sinon phrase par phrase : traduit seulement si chaque phrase est connue.
// Une phrase du corpus peut en contenir plusieurs : on essaie d'abord les plus longues suites.
// Une phrase faite uniquement de faits passe telle quelle.
function chercherMessage(texte: string, index: Index): Morceau[] | null {
  const phrases = texte.split(COUPURE);
  const morceaux: Morceau[] = [];
  for (let debut = 0; debut < phrases.length; ) {
    let fin = phrases.length;
    let trouve: Trouve | null = null;
    for (; fin > debut && !trouve; fin--) trouve = chercher(phrases.slice(debut, fin).join(' '), index);
    if (trouve) fin++;
    else if (queDesFaits(phrases[debut])) fin = debut + 1;
    else return null;
    morceaux.push({ texte: phrases.slice(debut, fin).join(' '), trouve });
    debut = fin;
  }
  return morceaux.some((morceau) => morceau.trouve) ? morceaux : null;
}

function assembler(morceaux: Morceau[], options: Options) {
  const rendus = morceaux.map(({ texte, trouve }) => (trouve ? rendre(trouve.phrase, trouve.valeurs, options) : { statut: 'ok' as Statut, sortie: texte }));
  const connues = morceaux.flatMap((morceau) => (morceau.trouve ? [morceau.trouve] : []));
  const manque = rendus.find((rendu) => rendu.sortie === null);
  return {
    statut: manque ? manque.statut : rendus.some((rendu) => rendu.statut === 'test') ? 'test' as Statut : 'ok' as Statut,
    sortie: manque ? null : rendus.map((rendu) => rendu.sortie).join(' '),
    critique: connues.some((trouve) => trouve.phrase.critique),
    id: connues.map((trouve) => trouve.phrase.id).join('+'),
    valeurs: connues.flatMap((trouve) => Object.values(trouve.valeurs)),
  };
}

// null : rien à traduire (texte vide ou uniquement des faits)
export function traduire(brut: string, pack: Pack, options: Options = {}): Resultat | null {
  const texte = normaliser(brut);
  if (!texte || queDesFaits(texte)) return null;

  const morceaux = chercherMessage(texte, indexDe(pack));
  if (!morceaux) {
    const categorie = estPhrase(texte) ? categoriser(texte) : null;
    return { statut: 'non_verifie', critique: false, sortie: null, id: null, categorie, valeurs: [] };
  }

  let { statut, sortie, critique, id, valeurs } = assembler(morceaux, options);
  // Garde-fou : jamais de champ non rempli, jamais un chiffre ou une devise qui change
  if (sortie && (/\{\w+\}/.test(sortie) || !memesChiffres(texte, sortie))) {
    sortie = null;
    statut = 'rejete';
  }
  return { statut, critique, sortie, id, categorie: null, valeurs };
}
