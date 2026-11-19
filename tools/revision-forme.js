// Contrôles d'orthographe et de forme de la traduction (tous « à revoir ») : ce sont des questions de charte,
// à trancher par les locuteurs, pas des fautes établies.

import { A_REVOIR, constat, motsDe } from './revision-commun.js';

const premiereLettre = (s) => (s.match(/\p{L}/u) || [''])[0];
const finale = (s) => (s.trim().match(/[.!?…]$/) || [''])[0];
const estMajuscule = (lettre) => lettre !== '' && lettre === lettre.toUpperCase() && lettre !== lettre.toLowerCase();
// Après . ! ? — ou :, une majuscule est normale
const COUPURE = /[.!?—:]\s*$/;

function minuscules(phrases) {
  return phrases.filter((p) => p.cible && estMajuscule(premiereLettre(p.fr)) && !estMajuscule(premiereLettre(p.cible)))
    .map((p) => constat([p.id], 'minuscule', A_REVOIR, `Le français commence par une majuscule, la traduction par une minuscule : « ${p.cible} ».`,
      'Faut-il une majuscule au début ? (voir la charte d\'orthographe)'));
}

// Mots écrits avec une majuscule au milieu d'une phrase, hors noms propres et marques (présents tels quels
// dans le français ou l'anglais) et hors mots du glossaire, qui relèvent d'une seule question de charte
function majusculesInterieures(phrases, glossaire) {
  const motsGlossaire = new Set(glossaire.flatMap((t) => motsDe(t.cible)));
  const parPhrase = [];
  let glossaireTouche = 0;
  for (const p of phrases.filter((x) => x.cible)) {
    const sources = new Set([p.fr, ...p.en].flatMap((s) => (s.match(/\p{L}[\p{L}']*/gu) || [])));
    const suspects = [];
    let glossaireIci = false;
    for (const trouve of p.cible.matchAll(/\p{Lu}[\p{L}'’]*/gu)) {
      const avant = p.cible.slice(0, trouve.index);
      if (!avant.trim() || COUPURE.test(avant) || sources.has(trouve[0]) || /\{[^}]*$/.test(avant) || trouve[0] === trouve[0].toUpperCase()) continue;
      if (motsGlossaire.has(motsDe(trouve[0])[0])) glossaireIci = true;
      else suspects.push(trouve[0]);
    }
    if (glossaireIci) glossaireTouche++;
    if (suspects.length) parPhrase.push(constat([p.id], 'majuscule', A_REVOIR, `Majuscule au milieu de la phrase : ${suspects.map((m) => `« ${m} »`).join(', ')} dans « ${p.cible} ».`, 'Ce mot doit-il garder sa majuscule ?'));
  }
  const charte = glossaireTouche
    ? [constat(['charte'], 'majuscule-glossaire', A_REVOIR, `Dans ${glossaireTouche} phrases, des mots du glossaire (par exemple ceux du solde, du compte ou du bénéficiaire) sont écrits avec une majuscule au milieu de la phrase.`, 'Ces mots s\'écrivent-ils avec une majuscule au milieu d\'une phrase ? (une seule réponse, dans la charte)')]
    : [];
  return [...charte, ...parPhrase];
}

function apostrophes(phrases) {
  const droites = phrases.filter((p) => p.cible.includes("'"));
  const courbes = phrases.filter((p) => p.cible.includes('’'));
  if (!droites.length || !courbes.length) return [];
  const [minorite, forme, autre] = droites.length < courbes.length ? [droites, "'", '’'] : [courbes, '’', "'"];
  return minorite.map((p) => constat([p.id], 'apostrophe', A_REVOIR, `Apostrophe « ${forme} » alors que la plupart des phrases utilisent « ${autre} » : « ${p.cible} ».`, 'Quelle apostrophe faut-il utiliser partout ? (voir la charte)'));
}

function espacesEtPonctuation(phrases) {
  const constats = [];
  for (const p of phrases.filter((x) => x.cible)) {
    if (/\s{2,}|\s,/.test(p.cible)) constats.push(constat([p.id], 'espaces', A_REVOIR, `Espaces en trop (double espace ou espace avant une virgule) : « ${p.cible} ».`, 'Peut-on corriger les espaces ?'));
    if (finale(p.fr) !== finale(p.cible)) {
      constats.push(constat([p.id], 'ponctuation', A_REVOIR, `Le français finit par « ${finale(p.fr) || 'rien'} », la traduction par « ${finale(p.cible) || 'rien'} ».`, 'Faut-il la même ponctuation à la fin ?'));
    }
  }
  return constats;
}

// Écriture et lettres exclues : choix de la charte, lus dans infos.json (ecriture : code ISO 15924, Latn…)
function lettreHors(profil) {
  const { ecriture, lettres_exclues: exclues = '' } = profil;
  const inconnue = new Error(`infos.json : écriture « ${ecriture} » inconnue (code ISO 15924 attendu, par exemple Latn)`);
  if (ecriture && !/^[A-Z][a-z]{3}$/.test(ecriture)) throw inconnue;
  let horsEcriture = null;
  try {
    horsEcriture = ecriture ? new RegExp(String.raw`(?![\p{Script=${ecriture}}])\p{L}`, 'u') : null;
  } catch {
    throw inconnue;
  }
  const interdites = new Set([...exclues.toLowerCase()]);
  return (texte) => horsEcriture?.test(texte) || [...texte.toLowerCase()].some((lettre) => interdites.has(lettre));
}

function alphabet(phrases, profil) {
  if (!profil.ecriture && !profil.lettres_exclues) return [];
  const hors = lettreHors(profil);
  const choisi = profil.orthographe ? `l'alphabet choisi (${profil.orthographe})` : "l'alphabet choisi";
  return phrases.filter((p) => p.cible && hors(p.cible))
    .map((p) => constat([p.id], 'alphabet', A_REVOIR, `Lettre hors de ${choisi} : « ${p.cible} ».`, "Faut-il l'écrire avec les lettres de l'alphabet choisi ?"));
}

// Formes d'adresse au client (infos.json, formes_adresse) : un mot entier (mots) ou un début de mot (debuts),
// en respectant la casse : chaque variante voulue (Wo, WO…) est écrite dans le profil
function emploie(forme) {
  const echappe = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const motifs = [...(forme.mots || []).map((mot) => String.raw`${echappe(mot)}(?=[^\p{L}]|$)`), ...(forme.debuts || []).map(echappe)];
  const motif = new RegExp(String.raw`(^|[^\p{L}])(${motifs.join('|')})`, 'u');
  return (p) => motif.test(p.cible.replace(/’/g, "'"));
}

// Quand deux formes d'adresse se côtoient, on interroge la minoritaire
function politesse(phrases, reponseCharte, profil) {
  if ((profil.formes_adresse || []).length < 2) return [];
  const [a, b] = profil.formes_adresse.map((forme) => {
    const test = emploie(forme);
    return { nom: forme.nom, emploie: test, phrases: phrases.filter((p) => p.cible && test(p)) };
  });
  if (!a.phrases.length || !b.phrases.length) return [];
  const [minorite, majorite] = a.phrases.length <= b.phrases.length ? [a, b] : [b, a];
  const combien = majorite.phrases.length > minorite.phrases.length ? 'la plupart des' : "d'autres";
  const rappel = reponseCharte ? ` La charte dit : « ${reponseCharte} ».` : '';
  return minorite.phrases.map((p) => constat([p.id], 'politesse', A_REVOIR,
    `Cette phrase s'adresse au client avec « ${minorite.nom} »${majorite.emploie(p) ? ` et aussi avec « ${majorite.nom} »` : ''}, alors que ${combien} phrases utilisent « ${majorite.nom} ».${rappel}`,
    'Est-ce voulu ici (les deux formes peuvent être justes selon la phrase), ou faut-il la forme de la charte ?'));
}

// Boutons et liens : 1 à 3 mots, pas plus de deux fois la longueur du français
function boutons(phrases, contexte) {
  return phrases.filter((p) => p.cible && /bouton|lien/i.test(contexte[p.id]?.element || ''))
    .filter((p) => motsDe(p.cible).length > 3 || p.cible.length > 2 * p.fr.length)
    .map((p) => constat([p.id], 'bouton-long', A_REVOIR, `Texte de bouton long (${motsDe(p.cible).length} mots) : « ${p.cible} » pour « ${p.fr} ».`, 'Existe-t-il une forme plus courte, de 1 à 3 mots, sans perdre le sens ?'));
}

// profil : règles d'écriture de la langue, lues dans infos.json ; sans profil, aucun contrôle d'alphabet ni d'adresse
export function controlerForme(phrases, glossaire, contexte, reponsePolitesse, profil = {}) {
  return [
    ...minuscules(phrases), ...majusculesInterieures(phrases, glossaire), ...apostrophes(phrases),
    ...espacesEtPonctuation(phrases), ...alphabet(phrases, profil), ...politesse(phrases, reponsePolitesse, profil), ...boutons(phrases, contexte),
  ];
}
