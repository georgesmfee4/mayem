// packs/<langue>/ : corpus.csv + glossaire.csv + infos.json -> pack.json
// Usage : npm run pack [-- <langue>] (la langue est facultative s'il n'y en a qu'une)
// Le pack n'est écrit que s'il passe check-pack : un pack invalide ne remplace jamais le bon.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { lireCsv } from './csv.js';
import { verifierPack } from './check-pack.js';
import { controler } from '../core/controle.ts';
import { choisirLangue, dossier } from './langues.js';

const langue = choisirLangue(process.argv[2]);
const ici = dossier(langue);
const lire = (nom) => readFileSync(ici + nom, 'utf8');
const oui = (v) => ['1', 'oui', 'yes', 'x'].includes((v || '').trim().toLowerCase());

// Les locuteurs renomment parfois les en-têtes du tableur (le kit dit « TERME BULU APPROUVÉ »
// et « Choisi par », le fichier de Bene « TRADUCTION BULU » et « Traduit par »).
// Chaque champ accepte donc plusieurs débuts d'en-tête, sans tenir compte des majuscules.
const COLONNES_GLOSSAIRE = {
  ref: ['réf'],
  terme: ['terme français', 'catégorie'],
  en: ['anglais'],
  sens: ['sens dans', 'texte français'],
  critique: ['critique'],
  bulu: ['terme bulu', 'traduction bulu'],
  a_eviter: ['mots à éviter'],
  traduit_par: ['traduit par', 'choisi par'],
  relu_par: ['relu par'],
  commentaire: ['commentaire'],
};
const COLONNES_CORPUS = ['id', 'fr', 'en', 'bulu', 'critique', 'valide_par', 'valide'];
// retraduction.csv vient de tools/kit.py import (fichier de retraduction rempli)
const COLONNES_RETRADUCTION = {
  ref: ['réf'],
  bulu: ['texte bulu'],
  texte: ['votre traduction'],
  par: ['traduit par'],
};

const erreurs = [];

// Pour chaque champ, l'en-tête réel du fichier ; une colonne introuvable est une erreur,
// sinon le bulu du glossaire arriverait vide sans que personne ne le voie
function trouverColonnes(entetes, fichier, colonnes) {
  const correspondance = {};
  for (const [champ, debuts] of Object.entries(colonnes)) {
    const entete = entetes.find((e) => debuts.some((d) => e.trim().toLowerCase().startsWith(d)));
    if (entete) correspondance[champ] = entete;
    else erreurs.push(`${fichier} : colonne « ${champ} » introuvable (en-têtes : ${entetes.join(', ')})`);
  }
  return correspondance;
}

// tools/kit.py écrit « Traducteur / relu par Relecteur » dans la colonne valide_par
function personnes(validePar) {
  const [traduit_par = '', relu_par = ''] = (validePar || '').split(/\s*\/\s*relu par\s*/i);
  return { traduit_par: traduit_par.trim(), relu_par: relu_par.trim() };
}

// Apostrophes et espaces varient d'un tableur à l'autre sans changer le texte
const comparable = (texte) => texte.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// id -> { bulu, texte, par } ; vide tant qu'aucune retraduction n'a été importée
function lireRetraductions() {
  if (!existsSync(ici + 'retraduction.csv')) return new Map();
  const lignes = lireCsv(lire('retraduction.csv'));
  if (!lignes.length) return new Map();
  const colonnes = trouverColonnes(Object.keys(lignes[0]), 'retraduction.csv', COLONNES_RETRADUCTION);
  const cellule = (ligne, champ) => (ligne[colonnes[champ]] || '').trim();
  return new Map(lignes
    .filter((l) => cellule(l, 'ref') && cellule(l, 'texte'))
    .map((l) => [cellule(l, 'ref'), { bulu: cellule(l, 'bulu'), texte: cellule(l, 'texte'), par: cellule(l, 'par') }]));
}

const retraductions = lireRetraductions();
const perimees = [];

// Une retraduction ne vaut que pour le bulu qui a été lu : si la phrase a changé depuis, on l'écarte
function retraductionDe(id, bulu) {
  const r = retraductions.get(id);
  if (!r) return { retraduit_par: '', retraduction: '' };
  if (comparable(r.bulu) !== comparable(bulu)) {
    perimees.push(id);
    return { retraduit_par: '', retraduction: '' };
  }
  return { retraduit_par: r.par, retraduction: r.texte };
}

function versPhrase(ligne) {
  const bulu = (ligne.bulu || '').trim();
  return {
    id: ligne.id.trim(),
    fr: ligne.fr.trim(),
    en: (ligne.en || '').split('|').map((e) => e.trim()).filter(Boolean),
    bulu,
    critique: ligne.critique.trim() === '1',
    ...personnes(ligne.valide_par),
    ...retraductionDe(ligne.id.trim(), bulu),
    valide: oui(ligne.valide),
  };
}

function lireGlossaire() {
  const lignes = lireCsv(lire('glossaire.csv'));
  if (!lignes.length) return [];
  const colonnes = trouverColonnes(Object.keys(lignes[0]), 'glossaire.csv', COLONNES_GLOSSAIRE);
  const cellule = (ligne, champ) => (ligne[colonnes[champ]] || '').trim();
  return lignes
    .map((ligne) => {
      const terme = Object.fromEntries(Object.keys(COLONNES_GLOSSAIRE).map((champ) => [champ, cellule(ligne, champ)]));
      return { ...terme, critique: terme.critique.toLowerCase() === 'oui' };
    })
    .filter((t) => t.ref); // les lignes sans référence sont des titres de section
}

function lirePhrases() {
  const lignes = lireCsv(lire('corpus.csv'));
  const manquantes = COLONNES_CORPUS.filter((c) => lignes.length && !(c in lignes[0]));
  if (manquantes.length) {
    erreurs.push(`corpus.csv : colonne(s) manquante(s) : ${manquantes.join(', ')}`);
    return [];
  }
  return lignes.map(versPhrase);
}

// Message d'erreur suivi du texte concerné, pour que la correction se fasse sans chercher
function expliquer(erreur, phrases) {
  const phrase = phrases.find((p) => erreur.startsWith(p.id + ' :'));
  if (!phrase) return erreur;
  return `${erreur}\n    fr   : ${phrase.fr}\n    bulu : ${phrase.bulu || '(vide)'}`;
}

const pack = {
  ...JSON.parse(lire('infos.json')),
  glossaire: lireGlossaire(),
  phrases: lirePhrases(),
};
if (!erreurs.length) erreurs.push(...verifierPack(pack));

if (erreurs.length) {
  console.error(erreurs.map((e) => expliquer(e, pack.phrases)).join('\n'));
  console.error(`\n${erreurs.length} problème(s). Pack non écrit : l'ancien reste en place.`);
  console.error(`Corriger packs/${langue}/corpus.csv (ou le tableur puis réimporter) et relancer.`);
  process.exit(1);
}
writeFileSync(ici + 'pack.json', JSON.stringify(pack, null, 2) + '\n');
const validees = pack.phrases.filter((p) => p.valide).length;
const termes = pack.glossaire.filter((t) => t.bulu).length;
const retraduites = pack.phrases.filter((p) => p.retraduction).length;
console.log(`${pack.phrases.length} phrases (${validees} validées, ${retraduites} retraduites), ${pack.glossaire.length} termes (${termes} traduits) -> packs/${langue}/pack.json`);
if (perimees.length) {
  console.log(`Retraduction à refaire (le bulu a changé depuis) : ${perimees.join(', ')}`);
}
const aRelire = controler(pack);
if (aRelire.length) console.log(`${aRelire.length} points à faire relire (glossaire, cohérence, négations) : npm run controle`);
