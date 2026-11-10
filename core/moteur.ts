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
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Modele { motif: RegExp; phrase: Phrase; precision: number }
interface Index {
  exactes: Map<string, Phrase>;
  modeles: Modele[];
  parId: Map<string, Phrase>;
}

function versRegex(source: string): RegExp {
  const corps = normaliser(source)
    .split(/(\{\w+\})/)
    .map((morceau) => {
      const champ = morceau.match(/^\{(\w+)\}$/);
      if (champ) return `(?<${champ[1]}>${CHAMPS[typeDeChamp(champ[1])] || LIBRE})`;
      return echapper(morceau).replace(/ /g, '\\s*');
    })
    .join('');
  return new RegExp(`^${corps}$`, 'iu');
}

function indexer(pack: Pack): Index {
  const index: Index = { exactes: new Map(), modeles: [], parId: new Map() };
  for (const phrase of pack.phrases) {
    index.parId.set(phrase.id, phrase);
    for (const source of [phrase.fr, ...phrase.en]) {
      if (/\{\w+\}/.test(source)) {
        const precision = source.replace(/\{\w+\}/g, '').length;
        index.modeles.push({ motif: versRegex(source), phrase, precision });
      } else {
        index.exactes.set(normaliser(source).toLowerCase(), phrase);
      }
    }
  }
  index.modeles.sort((a, b) => b.precision - a.precision); // les modèles les plus précis d'abord
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
  else if (options.test) [statut, sortie] = ['test', '‹bu› ' + remplir(phrase.fr, valeurs)];
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
  for (const modele of index.modeles) {
    const trouve = texte.match(modele.motif);
    if (trouve) return { phrase: modele.phrase, valeurs: trouve.groups || {} };
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
