// Contrôles d'orthographe et de forme du bulu (tous « à revoir ») : ce sont des questions de charte,
// à trancher par les locuteurs, pas des fautes établies.

import { A_REVOIR, constat, motsDe } from './revision-commun.js';

const premiereLettre = (s) => (s.match(/\p{L}/u) || [''])[0];
const finale = (s) => (s.trim().match(/[.!?…]$/) || [''])[0];
const estMajuscule = (lettre) => lettre !== '' && lettre === lettre.toUpperCase() && lettre !== lettre.toLowerCase();
// Après . ! ? — ou :, une majuscule est normale
const COUPURE = /[.!?—:]\s*$/;

function minuscules(phrases) {
  return phrases.filter((p) => p.bulu && estMajuscule(premiereLettre(p.fr)) && !estMajuscule(premiereLettre(p.bulu)))
    .map((p) => constat([p.id], 'minuscule', A_REVOIR, `Le français commence par une majuscule, le bulu par une minuscule : « ${p.bulu} ».`,
      'Faut-il une majuscule au début ? (voir la charte d\'orthographe)'));
}

// Mots écrits avec une majuscule au milieu d'une phrase, hors noms propres et marques (présents tels quels
// dans le français ou l'anglais) et hors mots du glossaire, qui relèvent d'une seule question de charte
function majusculesInterieures(phrases, glossaire) {
  const motsGlossaire = new Set(glossaire.flatMap((t) => motsDe(t.bulu)));
  const parPhrase = [];
  let glossaireTouche = 0;
  for (const p of phrases.filter((x) => x.bulu)) {
    const sources = new Set([p.fr, ...p.en].flatMap((s) => (s.match(/\p{L}[\p{L}']*/gu) || [])));
    const suspects = [];
    let glossaireIci = false;
    for (const trouve of p.bulu.matchAll(/\p{Lu}[\p{L}'’]*/gu)) {
      const avant = p.bulu.slice(0, trouve.index);
      if (!avant.trim() || COUPURE.test(avant) || sources.has(trouve[0]) || /\{[^}]*$/.test(avant) || trouve[0] === trouve[0].toUpperCase()) continue;
      if (motsGlossaire.has(motsDe(trouve[0])[0])) glossaireIci = true;
      else suspects.push(trouve[0]);
    }
    if (glossaireIci) glossaireTouche++;
    if (suspects.length) parPhrase.push(constat([p.id], 'majuscule', A_REVOIR, `Majuscule au milieu de la phrase : ${suspects.map((m) => `« ${m} »`).join(', ')} dans « ${p.bulu} ».`, 'Ce mot doit-il garder sa majuscule ?'));
  }
  const charte = glossaireTouche
    ? [constat(['charte'], 'majuscule-glossaire', A_REVOIR, `Dans ${glossaireTouche} phrases, des mots du glossaire (par exemple ceux du solde, du compte ou du bénéficiaire) sont écrits avec une majuscule au milieu de la phrase.`, 'Ces mots s\'écrivent-ils avec une majuscule au milieu d\'une phrase ? (une seule réponse, dans la charte)')]
    : [];
  return [...charte, ...parPhrase];
}

function apostrophes(phrases) {
  const droites = phrases.filter((p) => p.bulu.includes("'"));
  const courbes = phrases.filter((p) => p.bulu.includes('’'));
  if (!droites.length || !courbes.length) return [];
  const [minorite, forme, autre] = droites.length < courbes.length ? [droites, "'", '’'] : [courbes, '’', "'"];
  return minorite.map((p) => constat([p.id], 'apostrophe', A_REVOIR, `Apostrophe « ${forme} » alors que la plupart des phrases utilisent « ${autre} » : « ${p.bulu} ».`, 'Quelle apostrophe faut-il utiliser partout ? (voir la charte)'));
}

function espacesEtPonctuation(phrases) {
  const constats = [];
  for (const p of phrases.filter((x) => x.bulu)) {
    if (/\s{2,}|\s,/.test(p.bulu)) constats.push(constat([p.id], 'espaces', A_REVOIR, `Espaces en trop (double espace ou espace avant une virgule) : « ${p.bulu} ».`, 'Peut-on corriger les espaces ?'));
    if (finale(p.fr) !== finale(p.bulu)) {
      constats.push(constat([p.id], 'ponctuation', A_REVOIR, `Le français finit par « ${finale(p.fr) || 'rien'} », le bulu par « ${finale(p.bulu) || 'rien'} ».`, 'Faut-il la même ponctuation à la fin ?'));
    }
  }
  return constats;
}

// Alphabet de l'Église presbytérienne : pas de ɔ, ŋ, ɛ, ni de lettre hors de l'alphabet latin
function alphabet(phrases) {
  return phrases.filter((p) => /[ɔŋɛƆŊƐ]|(?![\p{Script=Latin}])\p{L}/u.test(p.bulu))
    .map((p) => constat([p.id], 'alphabet', A_REVOIR, `Lettre hors de l'alphabet choisi (Église presbytérienne) : « ${p.bulu} ».`, 'Faut-il l\'écrire avec les lettres de l\'alphabet choisi ?'));
}

// Forme polie : les phrases en w'/wo et celles en ô adressées au client ; on interroge la forme minoritaire
function politesse(phrases, reponseCharte) {
  const enWo = (p) => /(^|[^\p{L}])(wo|w['’])/iu.test(p.bulu);
  const enO = (p) => /(^|[^\p{L}])ô(?=[^\p{L}]|$)/u.test(p.bulu);
  const wo = phrases.filter(enWo);
  const o = phrases.filter(enO);
  if (!wo.length || !o.length) return [];
  const [minorite, forme, autre] = o.length <= wo.length ? [o, 'ô', 'w\'/wo'] : [wo, 'w\'/wo', 'ô'];
  const rappel = reponseCharte ? ` La charte dit : « ${reponseCharte} ».` : '';
  return minorite.map((p) => constat([p.id], 'politesse', A_REVOIR,
    `Cette phrase s'adresse au client avec « ${forme} »${enWo(p) && enO(p) ? ' et aussi avec « w\'/wo »' : ''}, alors que ${autre === 'ô' ? 'd\'autres' : 'la plupart des'} phrases utilisent « ${autre} ».${rappel}`,
    'Est-ce voulu ici (les deux formes peuvent être justes selon la phrase), ou faut-il la forme de la charte ?'));
}

// Boutons et liens : 1 à 3 mots, pas plus de deux fois la longueur du français
function boutons(phrases, contexte) {
  return phrases.filter((p) => p.bulu && /bouton|lien/i.test(contexte[p.id]?.element || ''))
    .filter((p) => motsDe(p.bulu).length > 3 || p.bulu.length > 2 * p.fr.length)
    .map((p) => constat([p.id], 'bouton-long', A_REVOIR, `Texte de bouton long (${motsDe(p.bulu).length} mots) : « ${p.bulu} » pour « ${p.fr} ».`, 'Existe-t-il une forme plus courte, de 1 à 3 mots, sans perdre le sens ?'));
}

export function controlerForme(phrases, glossaire, contexte, reponsePolitesse) {
  return [
    ...minuscules(phrases), ...majusculesInterieures(phrases, glossaire), ...apostrophes(phrases),
    ...espacesEtPonctuation(phrases), ...alphabet(phrases), ...politesse(phrases, reponsePolitesse), ...boutons(phrases, contexte),
  ];
}
