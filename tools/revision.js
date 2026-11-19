// Révision de fidélité : tout ce qui, dans le corpus et le glossaire, peut faire perdre des points à un jury
// linguiste. Fonction pure : des phrases et un glossaire (forme de pack.json) en entrée, des constats en sortie.
// Chaque constat explique en français simple ce qui a été repéré et pose une question aux locuteurs.
// Rien n'est corrigé ici, et aucune traduction n'est proposée : seuls les locuteurs écrivent leur langue.

import { controler } from '../core/controle.ts';
import { A_REVOIR, BLOQUANT, cle, constat, contientMots, motsDe } from './revision-commun.js';
import { controlerForme } from './revision-forme.js';

const formes = (champ) => (champ || '').split('/').map((f) => f.trim()).filter(Boolean);
const explique = (texte) => /[(:;…]|\.\.\.|\bpour\b|\.$/.test(texte);
const cite = (p) => `${p.id} « ${p.fr} »`;

// 1. Une même traduction pour des phrases françaises différentes
function sensConfondus(phrases) {
  const groupes = new Map();
  for (const p of phrases.filter((x) => x.cible)) groupes.set(cle(p.cible), [...(groupes.get(cle(p.cible)) || []), p]);
  return [...groupes.values()]
    .filter((groupe) => new Set(groupe.map((p) => cle(p.fr))).size > 1)
    .map((groupe) => {
      const melange = groupe.some((p) => p.critique) && groupe.some((p) => !p.critique);
      return constat(groupe.map((p) => p.id), 'sens-confondus', melange ? BLOQUANT : A_REVOIR,
        `La même traduction « ${groupe[0].cible} » est utilisée pour des phrases françaises différentes : ${groupe.map(cite).join(', ')}.`,
        'Ces phrases n\'ont pas le même sens en français. Un client doit-il pouvoir les distinguer ? Si oui, donnez une traduction différente à chacune.');
    });
}

// Même français, plusieurs traductions : le client verrait deux mots pour la même chose
function traductionsMultiples(phrases) {
  const groupes = new Map();
  for (const p of phrases.filter((x) => x.cible)) groupes.set(cle(p.fr), [...(groupes.get(cle(p.fr)) || []), p]);
  return [...groupes.values()]
    .filter((groupe) => new Set(groupe.map((p) => cle(p.cible))).size > 1)
    .map((groupe) => constat(groupe.map((p) => p.id), 'traductions-multiples', A_REVOIR,
      `La même phrase française « ${groupe[0].fr} » est traduite de plusieurs façons : ${groupe.map((p) => `${p.id} « ${p.cible} »`).join(', ')}.`,
      'Faut-il garder une seule traduction partout ?'));
}

// 2. Collisions du glossaire : même terme traduit pour deux concepts, ou terme contenu dans celui d'un autre concept
function collisionsGlossaire(glossaire) {
  // « le montant : singulier », « envoyer : ordre » : formes grammaticales d'un même mot, pas des concepts
  const entrees = glossaire.filter((t) => t.cible && !explique(t.cible) && !t.terme.includes(':'))
    .flatMap((t) => formes(t.cible).map((cible) => ({ t, cible })));
  const constats = [];
  for (const [i, a] of entrees.entries()) {
    for (const b of entrees.slice(i + 1)) {
      if (a.t.ref === b.t.ref || !a.t.critique && !b.t.critique) continue;
      const egal = cle(a.cible) === cle(b.cible);
      const [court, long] = motsDe(a.cible).length <= motsDe(b.cible).length ? [a, b] : [b, a];
      // Un mot contenu dans une expression composée est courant ; il ne compte que si les deux idées
      // touchent à l'argent ou à la sécurité (« ôsu », au moins, dans « Kele ôsu », continuer)
      const inclus = a.t.critique && b.t.critique && motsDe(court.cible).length < motsDe(long.cible).length && contientMots(long.cible, court.cible);
      if (!egal && !inclus) continue;
      constats.push(constat([a.t.ref, b.t.ref], egal ? 'glossaire-double' : 'glossaire-inclus', A_REVOIR,
        egal
          ? `Le terme « ${a.cible} » est approuvé pour deux idées différentes : « ${a.t.terme} » (${a.t.ref}) et « ${b.t.terme} » (${b.t.ref}).`
          : `Le terme « ${court.cible} » (« ${court.t.terme} », ${court.t.ref}) se retrouve dans « ${long.cible} » (« ${long.t.terme} », ${long.t.ref}).`,
        egal ? 'Faut-il un mot différent pour chacune de ces idées ?' : 'Un client peut-il confondre les deux ? Faut-il changer l\'un des termes ?'));
    }
  }
  return constats;
}

// 3. Termes critiques et négations du glossaire absents de la traduction (détection du français imparfaite)
function termesCritiques(phrases, glossaire) {
  const pack = { phrases: phrases.map((p) => ({ ...p, valide: true })), glossaire };
  return controler(pack).filter((point) => point.terme).map((point) => {
    const p = phrases.find((x) => x.id === point.ids[0]);
    const negation = point.type === 'negation';
    // terme : réf. du glossaire, pour que le tableur propose aussi de revoir le terme lui-même
    return { ...constat(point.ids, negation ? 'negation' : 'terme-critique', A_REVOIR,
      negation
        ? `La phrase française contient une négation (« ${point.terme.fr} ») : « ${p.fr} ». La forme du glossaire « ${point.terme.attendu} » n'apparaît pas dans la traduction.`
        : `La phrase française contient « ${point.terme.fr} » : « ${p.fr} ». Le glossaire le traduit « ${point.terme.attendu} », qui n'apparaît pas dans la traduction.`,
      negation ? 'Le sens négatif est-il bien rendu ? Un oubli inverse le sens du message.' : 'Faut-il utiliser le terme du glossaire, ou cette formulation est-elle voulue ?'), terme: point.terme.ref };
  });
}

// 4. Termes du glossaire sans traduction, critiques d'abord
function sansTraduction(glossaire) {
  return glossaire.filter((t) => !t.cible.trim()).sort((a, b) => b.critique - a.critique)
    .map((t) => constat([t.ref], 'glossaire-vide', A_REVOIR,
      `Le terme « ${t.terme} »${t.critique ? ' (important : argent ou sécurité)' : ''} n'a pas encore de traduction.`,
      'Quel terme faut-il utiliser ?'));
}


const ORDRE_NIVEAU = { [BLOQUANT]: 0, [A_REVOIR]: 1 };
const rangPriorite = (contexte, refs) => Math.min(...refs.map((ref) => {
  const c = contexte[ref];
  return c ? (c.priorite === 'P1' ? 0 : 2) + (c.critique === '1' ? 0 : 1) : 4;
}));

// Tous les constats, bloquants puis à revoir, P1 critiques d'abord. contexte : id -> ligne du corpus
// (priorité, écran, élément, consigne) ; politesse : réponse de la charte (style.csv) ;
// profil : règles d'écriture de la langue (infos.json)
export function reviser({ phrases, glossaire, contexte = {}, politesse = '', profil = {} }) {
  const constats = [
    ...sensConfondus(phrases), ...traductionsMultiples(phrases), ...collisionsGlossaire(glossaire),
    ...termesCritiques(phrases, glossaire), ...sansTraduction(glossaire), ...controlerForme(phrases, glossaire, contexte, politesse, profil),
  ];
  for (const c of constats) {
    const consignes = c.refs.map((ref) => contexte[ref]?.consigne).filter(Boolean);
    if (consignes.length) c.consigne = [...new Set(consignes)].join(' / ');
  }
  return constats.sort((a, b) => ORDRE_NIVEAU[a.niveau] - ORDRE_NIVEAU[b.niveau] || rangPriorite(contexte, a.refs) - rangPriorite(contexte, b.refs));
}
