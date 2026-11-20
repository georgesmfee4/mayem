// Niveau 3, « sens reconnu » : une phrase française que le corpus n'a pas, mais qui dit exactement la même
// chose qu'une phrase validée, reçoit la traduction déjà validée de celle-ci. Rien n'est composé.
//
// Le travail se fait tout entier côté français. Deux textes ont le même sens quand ils ont la même forme
// canonique : mêmes mots porteurs de sens (casse, accents, ordre, mots outils, accords, politesse et
// synonymes métier mis à part) et mêmes traits de sens (négation, personne, temps, modalité, sens de
// l'argent, valeurs). Un seul trait différent, ou deux traductions possibles, et l'original reste.
// Mieux vaut reconnaître moins que se tromper une seule fois sur de l'argent.

import { MOTIFS } from './faits.ts';
import { sansAccents } from './langage.ts';
import type { Pack, Phrase } from './types.ts';

export interface Reconnu { phrase: Phrase; valeurs: Record<string, string> }

// Valeurs repérées dans le texte, par type, dans l'ordre des champs {…} du corpus
const TYPES: [string, string][] = [
  ['amount', MOTIFS.montant], ['date', MOTIFS.date], ['account', MOTIFS.compte], ['ref', MOTIFS.reference],
  ['phone', MOTIFS.telephone], ['percent', MOTIFS.pourcentage], ['code', String.raw`(?<!\d)\d{4,8}(?!\d)`],
];
const VALEURS = new RegExp(TYPES.map(([type, motif]) => `(?<${type}>${motif})`).join('|'), 'gu');
const CHAMP = /\{(\w+?)(?:_\d+)?\}/g;

// Mots outils : ils ne portent pas le sens à eux seuls. Négation, temps, personne et modalité sont relevés
// à part (traits) avant d'être retirés. Formules de politesse et adverbes d'insistance n'y changent rien.
const OUTILS = new Set(`le la les l un une des de du d a au aux en et ou pour sur avec par dans ce cet cette ces c ca
  ceci cela votre vos mon ma mes ton ta tes son sa ses notre nos leur leurs qui que qu quoi dont il elle ils elles on
  je j me m moi tu te t toi vous nous se s lui y est sont etre ete etait suis es sommes etes ai as avons avez ont
  avoir sera seront serez serai aura auront aurez aurai ne n pas jamais aucun aucune rien ni non sans nul nulle peux
  peut pouvez pouvons peuvent pourrez pourra pourront pourrai pouvoir dois doit devez devons doivent devrez devra
  devront devoir faut veuillez veuille merci svp plait bien toujours maintenant ici desormais simplement succes
  allez va vont allons vais aller etaient etais etiez etions avait avaient avais aviez avions`.split(/\s+/));

// Conjugaisons que la règle « -ez -> -er » ne ramène pas à l'infinitif
const IRREGULIERS: Record<string, string> = {
  saisisser: 'saisir', choisisser: 'choisir', remplisser: 'remplir', finisser: 'finir', recever: 'recevoir',
  prener: 'prendre', metter: 'mettre', attender: 'attendre',
};

// Synonymes du vocabulaire financier, à faire relire par un francophone de l'équipe avant chaque ajout :
// deux mots ne sont réunis que s'ils désignent la même chose dans un écran de paiement.
const SYNONYMES: Record<string, string> = {
  virement: 'transfert', envoi: 'transfert',
  transferer: 'envoyer', virer: 'envoyer', transfere: 'envoye', vire: 'envoye',
  destinataire: 'beneficiaire', somme: 'montant', transaction: 'operation',
  controler: 'verifier', renseigner: 'saisir', entrer: 'saisir', indiquer: 'saisir',
  probleme: 'erreur', recommencer: 'reessayer', voir: 'consulter', afficher: 'consulter',
  communiquer: 'partager', divulguer: 'partager', commission: 'frais', pin: 'secret',
  effectue: 'reussi', termine: 'reussi', abouti: 'reussi', definitif: 'irreversible', gratuite: 'gratuit',
  momentanement: 'temporairement', exact: 'correct',
};

// Sens de l'argent : un texte qui envoie ne peut pas reconnaître un texte qui reçoit
const ENVOI = new Set(['envoyer', 'envoye', 'payer', 'paye', 'paiement', 'debiter', 'debite', 'debit', 'retirer', 'retire', 'retrait', 'sortant']);
const RECEPTION = new Set(['recevoir', 'recu', 'crediter', 'credite', 'credit', 'encaisser', 'encaisse', 'entrant', 'deposer', 'depose', 'depot']);
const NEGATEURS: Record<string, string> = { ne: 'ne', n: 'ne', pas: 'pas', jamais: 'jamais', aucun: 'aucun', aucune: 'aucun', rien: 'rien', ni: 'ni', non: 'non', sans: 'sans', nul: 'nul', nulle: 'nul' };
const PREMIERE = new Set(['je', 'j', 'me', 'm', 'moi', 'mon', 'ma', 'mes']);
const POUVOIR = /^(peux|peut|pouvez|pouvons|peuvent|pourr\w*|possible|impossible)$/;
const DEVOIR = /^(dois|doit|devez|devons|doivent|devr\w*|faut|obligatoire|necessaire)$/;
// Participes sans « é » final (« reçu », « réussi ») : le temps ne se voit qu'à eux
const PARTICIPES = new Set(['recu', 'recue', 'reussi', 'reussie', 'survenu', 'survenue', 'abouti', 'aboutie', 'fait', 'parvenu', 'pris', 'mis']);
// Imparfait d'« être » et d'« avoir » : « était prévue » n'est pas « est prévue » (une échéance passée est un retard)
const PASSE = new Set(['etait', 'etaient', 'etais', 'etiez', 'etions', 'avait', 'avaient', 'avais', 'aviez', 'avions']);
const VOUS_SUJET = /(?:^|[^\p{L}])vous\s+(?!(?:devez|pouvez|allez|avez)(?!\p{L}))\p{L}+ez(?!\p{L})/u;
const FUTUR = /^(sera|seront|serez|serai|serons|aura|auront|aurez|aurai)$|\p{L}(?:erai|eras|era|erons|erez|eront|irai|ira|irez|iront|rrai|rra|rrez|rront|vrai|vra|vrez|vront)$/u;

// Mots qui finissent par s ou x au singulier : ce n'est pas un pluriel
const INVARIABLES = new Set(['frais', 'prix', 'choix', 'temps', 'fois', 'acces', 'succes', 'cours', 'mois', 'avis', 'refus', 'pays', 'depuis', 'relais']);

// Forme de base d'un mot (nu : le même sans accents) : pluriel, féminin, impératif ramenés à une seule forme.
// Le participe garde sa forme (« débité » n'est pas « débiter ») : le temps compte, il est relevé à part.
// Mise en cache : un pack de milliers de phrases répète les mêmes mots.
const cacheLemmes = new Map<string, string>();
function lemme(mot: string, nu: string): string {
  const deja = cacheLemmes.get(mot);
  if (deja !== undefined) return deja;
  let m = nu;
  if (m.length > 4 && !INVARIABLES.has(m)) m = m.replace(/[sx]$/, '');
  // « effectuée » -> « effectue » ; « reçue », « réussie », « insuffisante », « correcte », « supérieure »,
  // « définitive », « réelle » -> masculin
  if (m.length > 4 && /é(?:e?s?)$/u.test(mot)) m = m.replace(/ee$/, 'e');
  else if (m.length > 4) m = m.replace(/ez$/, 'er').replace(/(?<=[iu])e$/, '').replace(/(?<=[ae]n|c)te$/, 't').replace(/eure$/, 'eur').replace(/ive$/, 'if').replace(/elle$/, 'el');
  m = IRREGULIERS[m] || m;
  const resultat = SYNONYMES[m] || m;
  cacheLemmes.set(mot, resultat);
  return resultat;
}

export interface Forme { mots: string[]; traits: string; types: string[] }

// Mots du texte, valeurs déjà retirées ; l'apostrophe sépare (« l'argent », « n'a »)
const MOTS = /[^\p{L}]+/u;

function aspect(mots: string[], nus: string[], bas: string): string[] {
  const traits = new Set<string>();
  if (/(?:^|[^\p{L}])(?:à|a)\s+(?!votre|notre|leur)\p{L}{3,}(?:er|ir|re)(?!\p{L})/u.test(bas)) traits.add('a-faire');
  if (/(?:^|[^\p{L}])(?:allez|va|vont|allons|vais)\s+\p{L}+(?:er|ir|re)(?!\p{L})/u.test(bas)) traits.add('a-faire');
  if (nus.some((nu, i) => nu === 'en' && nus[i + 1] === 'cours')) traits.add('en-cours');
  mots.forEach((mot, i) => {
    const nu = nus[i];
    if (FUTUR.test(nu) || nu === 'bientot' || nu === 'prochainement') traits.add('a-faire');
    if (PASSE.has(nu)) traits.add('passe');
    if (/\p{L}{2}é(?:e?s?)$/u.test(mot) || PARTICIPES.has(nu) || ['ete', 'avez', 'ont', 'ai', 'avons'].includes(nu)) traits.add('fait');
  });
  return [...traits].sort();
}

// Traits de sens : deux textes de même sens les ont tous identiques
function traits(mots: string[], nus: string[], lemmes: string[], bas: string, types: string[]): string {
  // Comptée et non seulement notée : une négation de plus dans un texte qui en a déjà une change le sens
  const negation = nus.filter((m) => NEGATEURS[m]).map((m) => NEGATEURS[m]).sort();
  const modalite = [...new Set(nus.flatMap((m) => (POUVOIR.test(m) ? ['pouvoir'] : DEVOIR.test(m) ? ['devoir'] : [])))].sort();
  const argent = [...new Set(lemmes.flatMap((m) => (ENVOI.has(m) ? ['envoi'] : RECEPTION.has(m) ? ['reception'] : [])))].sort();
  // Seule la première personne est notée : « J'ai vérifié » n'est pas « Vérifiez ». « Vérifiez »
  // et « Vérifier », consigne écrite à l'impératif ou à l'infinitif, disent la même chose.
  const premiere = nus.some((m) => PREMIERE.has(m)) ? 'je' : '';
  // « Vous confirmez le transfert » constate ou demande ; « Confirmez le transfert » ordonne. Les verbes
  // d'appoint (devez, pouvez, allez, avez) sont déjà relevés par la modalité ou le temps.
  const constat = VOUS_SUJET.test(bas) ? 'vous' : '';
  return [negation.join('+'), modalite.join('+'), argent.join('+'), aspect(mots, nus, bas).join('+'), premiere + constat, [...types].sort().join('+')].join('|');
}

// Forme canonique d'un texte dont les valeurs sont déjà remplacées par « {type} ».
// Les accents ne sont retirés qu'une fois pour tout le texte : un mot garde le même rang avec ou sans eux.
export function forme(gabarit: string): Forme {
  const types = [...gabarit.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const bas = gabarit.replace(/\{\w+\}/g, ' ').toLowerCase().replace(/[’‘]/g, "'");
  const mots = bas.split(MOTS).filter(Boolean);
  let nus = sansAccents(bas).split(MOTS).filter(Boolean);
  if (nus.length !== mots.length) nus = mots.map(sansAccents);
  const lemmes = mots.map((mot, i) => lemme(mot, nus[i]));
  const porteurs = [...new Set(lemmes.filter((_, i) => !OUTILS.has(nus[i])))].sort();
  return { mots: porteurs, traits: traits(mots, nus, lemmes, bas, types), types };
}

const cleSens = (f: Forme) => `${f.mots.join(' ')}#${f.traits}`;

interface Entree { phrase: Phrase; champs: string[] }
type Table = Map<string, Entree | null>;
// cleSens -> phrase et noms de ses champs dans l'ordre ; null quand deux traductions différentes s'y disputent.
// sansAccents : les mêmes sources écrites sans accents, pour un service qui écrit « VIREMENT EFFECTUE » ;
// construite au premier texte sans accents seulement. Sans accents, « effectué » ne se distingue plus d'un
// présent : le temps n'y est relevé que par « à » + infinitif, le futur ou les auxiliaires, et il faut
// encore que les mots soient les mêmes.
interface Index { avecAccents: Table; sansAccents: Table | null }

const CONNUS = new Set(TYPES.map(([type]) => type));

function rangerSens(table: Table, source: string, phrase: Phrase) {
  const champs = [...source.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  // Un nom ({name}) n'a pas de forme reconnaissable : seuls les modèles exacts le placent
  if (champs.some((champ) => !CONNUS.has(champ.replace(/_\d+$/, '')))) return;
  const f = forme(source.replace(CHAMP, (_, type) => `{${type}}`));
  if (f.mots.length < 2) return; // un mot seul n'a pas assez de contexte pour qu'on en juge le sens
  const k = cleSens(f);
  const deja = table.get(k);
  if (deja === undefined) table.set(k, { phrase, champs });
  else if (deja && deja.phrase.cible.trim() !== phrase.cible.trim()) table.set(k, null);
}

function remplirTable(pack: Pack, ecrire: (source: string) => string): Table {
  const table: Table = new Map();
  for (const phrase of pack.phrases.filter((p) => p.valide && p.cible)) {
    for (const source of [phrase.fr, ...(phrase.variantes || [])]) rangerSens(table, ecrire(source), phrase);
  }
  return table;
}

const cacheSens = new WeakMap<Pack, Index>();
function tableSens(pack: Pack, avecAccents: boolean): Table {
  let index = cacheSens.get(pack);
  if (!index) cacheSens.set(pack, (index = { avecAccents: remplirTable(pack, (source) => source), sansAccents: null }));
  if (avecAccents) return index.avecAccents;
  return (index.sansAccents ||= remplirTable(pack, sansAccents));
}

// Texte -> gabarit (« Votre solde est de {amount} ») et valeurs par type, dans l'ordre du texte
function extraire(texte: string): { gabarit: string; valeurs: Map<string, string[]> } {
  const valeurs = new Map<string, string[]>();
  const gabarit = texte.replace(VALEURS, (...args) => {
    const groupes = args[args.length - 1] as Record<string, string | undefined>;
    const [type, valeur] = Object.entries(groupes).find(([, v]) => v !== undefined)!;
    valeurs.set(type, [...(valeurs.get(type) || []), valeur!.trim()]);
    return ` {${type}} `;
  });
  return { gabarit, valeurs };
}

export function reconnaitre(texte: string, pack: Pack): Reconnu | null {
  const { gabarit, valeurs } = extraire(texte);
  const f = forme(gabarit);
  if (f.mots.length < 2) return null;
  const entree = tableSens(pack, /[^\x00-\x7f]/.test(texte)).get(cleSens(f));
  if (!entree) return null;
  // Deux valeurs du même type (minimum et maximum) : rien ne dit laquelle va où, on s'abstient
  if ([...valeurs.values()].some((liste) => liste.length > 1)) return null;
  // Un « {date} » écrit tel quel dans la page a la forme d'un champ mais aucune valeur : on s'abstient
  if (entree.champs.some((champ) => !valeurs.has(champ.replace(/_\d+$/, '')))) return null;
  const rangees: Record<string, string> = {};
  for (const champ of entree.champs) rangees[champ] = valeurs.get(champ.replace(/_\d+$/, ''))![0];
  return { phrase: entree.phrase, valeurs: rangees };
}
