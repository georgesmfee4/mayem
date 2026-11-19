// Contrôle de la qualité des traductions validées : glossaire, cohérence, négations.
// Ce sont des indices à faire relire, pas des refus : un locuteur peut avoir raison contre
// le glossaire. Les chiffres et les champs {…}, eux, sont refusés par verifier.ts.
// Seules des règles du français sont écrites ici ; la traduction attendue vient du glossaire du pack.

import type { Pack, Phrase, Terme } from './types.ts';
import { echapper } from './moteur.ts';

export interface Point {
  type: 'glossaire' | 'coherence' | 'negation';
  ids: string[];
  message: string;
  // Glossaire et négation : le mot français repéré et la forme attendue du glossaire
  terme?: { ref: string; fr: string; attendu: string };
}

// Comparaison large : casse, apostrophes, espaces et accents ignorés (le glossaire et
// les phrases n'écrivent pas toujours les accents de la même façon)
const comparable = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'").replace(/[.…]+/g, ' ').replace(/\s+/g, ' ').trim();
const contientMot = (texte: string, mot: string) =>
  new RegExp(`(^|[^\\p{L}])${echapper(mot)}($|[^\\p{L}])`, 'iu').test(texte);
const formes = (champ: string) => champ.split('/').map((forme) => forme.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
// Formes françaises les plus simples d'un terme : pluriel, et conjugaisons courantes d'un verbe en -er
// (« confirmer » trouve « confirmez », « confirmé »). Imparfait mais sans faux sens.
function variantes(mot: string): string[] {
  const simple = comparable(mot);
  if (/^\p{L}+er$/u.test(simple)) return ['er', 'ez', 'e', 'es', 'ent', 'ons', 'é', 'ée', 'és', 'ées'].map((fin) => simple.slice(0, -2) + fin);
  return [simple, simple + 's', simple + 'x'];
}

// Négations du français, avec le mot qui retrouve l'entrée du glossaire correspondante.
// Les plus précises d'abord : « ne… jamais » n'attend pas aussi la négation simple.
const NEGATIONS: [RegExp, string][] = [
  [/\bjamais\b/i, 'jamais'],
  [/\b(ne|n')\b.*\bplus\b/i, 'ne… plus'],
  [/\b(ne|n')\b.*\bpersonne\b|\bavec personne\b/i, 'personne'],
  [/\b(ne|n')\b.*\brien\b/i, 'rien'],
  [/\baucun(e)?\b/i, 'aucun'],
  [/\bsans\b/i, 'sans'],
  [/\b(ne|n')\b.*\bpas\b/i, 'ne… pas'],
];

const estNegation = (terme: Terme) => NEGATIONS.some(([, cle]) => terme.terme.includes(cle));

// Terme utilisable tel quel : pas d'explication, d'exemple ni de forme à compléter
const termeSimple = (terme: Terme) =>
  terme.critique && terme.cible.trim() !== '' && !/[(:;…]|\.\.\.|\bpour\b|\.$/.test(terme.cible) && !terme.terme.includes(':') && !estNegation(terme);

function controlerGlossaire(phrases: Phrase[], glossaire: Terme[]): Point[] {
  const points: Point[] = [];
  for (const terme of glossaire.filter(termeSimple)) {
    const attendus = formes(terme.cible);
    for (const francais of formes(terme.terme).filter((mot) => mot.length >= 4)) {
      for (const phrase of phrases) {
        if (!variantes(francais).some((forme) => contientMot(comparable(phrase.fr), forme))) continue;
        if (attendus.some((forme) => comparable(phrase.cible).includes(comparable(forme)))) continue;
        points.push({ type: 'glossaire', ids: [phrase.id], message: `« ${francais} » → « ${terme.cible} » (${terme.ref}) absent : ${phrase.fr} => ${phrase.cible}`, terme: { ref: terme.ref, fr: francais, attendu: terme.cible } });
      }
    }
  }
  return points;
}

// Regroupe les éléments par clé et rend les groupes de plus d'un élément
function doublons<T>(elements: T[], cle: (e: T) => string): T[][] {
  const groupes = new Map<string, T[]>();
  for (const e of elements) {
    const k = cle(e);
    if (k) groupes.set(k, [...(groupes.get(k) || []), e]);
  }
  return [...groupes.values()].filter((groupe) => groupe.length > 1);
}

function controlerCoherence(phrases: Phrase[], glossaire: Terme[]): Point[] {
  const points: Point[] = [];
  for (const groupe of doublons(phrases, (p) => comparable(p.fr))) {
    if (new Set(groupe.map((p) => comparable(p.cible))).size > 1) {
      points.push({ type: 'coherence', ids: groupe.map((p) => p.id), message: `même français, traductions différentes : ${groupe.map((p) => `${p.id} « ${p.cible} »`).join(', ')}` });
    }
  }
  for (const groupe of doublons(phrases, (p) => comparable(p.cible))) {
    points.push({ type: 'coherence', ids: groupe.map((p) => p.id), message: `même traduction « ${groupe[0].cible} » pour : ${groupe.map((p) => `${p.id} « ${p.fr} »`).join(', ')}` });
  }
  for (const groupe of doublons(glossaire.filter((t) => t.cible), (t) => comparable(t.terme))) {
    if (new Set(groupe.map((t) => comparable(t.cible))).size > 1) {
      points.push({ type: 'coherence', ids: groupe.map((t) => t.ref), message: `terme « ${groupe[0].terme} » traduit de deux façons : ${groupe.map((t) => `${t.ref} « ${t.cible} »`).join(', ')}` });
    }
  }
  return points;
}

function controlerNegations(phrases: Phrase[], glossaire: Terme[]): Point[] {
  const points: Point[] = [];
  for (const phrase of phrases) {
    const trouvee = NEGATIONS.find(([motif]) => motif.test(phrase.fr));
    const terme = trouvee && glossaire.find((t) => t.cible && t.terme.includes(trouvee[1]));
    if (!terme) continue;
    const attendus = formes(terme.cible).map(comparable).filter(Boolean);
    if (attendus.some((forme) => comparable(phrase.cible).includes(forme))) continue;
    points.push({ type: 'negation', ids: [phrase.id], message: `négation « ${trouvee![1]} » → « ${terme.cible} » (${terme.ref}) absente : ${phrase.fr} => ${phrase.cible}`, terme: { ref: terme.ref, fr: trouvee![1], attendu: terme.cible } });
  }
  return points;
}

// Points à faire relire, sur les seules phrases validées (le reste n'est pas affiché)
export function controler(pack: Pack): Point[] {
  const phrases = pack.phrases.filter((p) => p.valide && p.cible);
  return [
    ...controlerGlossaire(phrases, pack.glossaire),
    ...controlerCoherence(phrases, pack.glossaire),
    ...controlerNegations(phrases, pack.glossaire),
  ];
}
