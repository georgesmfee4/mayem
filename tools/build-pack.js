// corpus.csv + glossaire.csv + packs/bum/infos.json -> packs/bum/pack.json
// Usage : node tools/build-pack.js
// Le pack n'est écrit que s'il passe check-pack : un pack invalide ne remplace jamais le bon.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lireCsv } from './csv.js';
import { verifierPack } from './check-pack.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(racine + chemin, 'utf8');
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

const erreurs = [];

// Pour chaque champ, l'en-tête réel du fichier ; une colonne introuvable est une erreur,
// sinon le bulu du glossaire arriverait vide sans que personne ne le voie
function trouverColonnes(entetes, fichier) {
  const correspondance = {};
  for (const [champ, debuts] of Object.entries(COLONNES_GLOSSAIRE)) {
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

function versPhrase(ligne) {
  return {
    id: ligne.id.trim(),
    fr: ligne.fr.trim(),
    en: (ligne.en || '').split('|').map((e) => e.trim()).filter(Boolean),
    bulu: (ligne.bulu || '').trim(),
    critique: ligne.critique.trim() === '1',
    ...personnes(ligne.valide_par),
    valide: oui(ligne.valide),
  };
}

function lireGlossaire() {
  const lignes = lireCsv(lire('glossaire.csv'));
  if (!lignes.length) return [];
  const colonnes = trouverColonnes(Object.keys(lignes[0]), 'glossaire.csv');
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
  ...JSON.parse(lire('packs/bum/infos.json')),
  glossaire: lireGlossaire(),
  phrases: lirePhrases(),
};
if (!erreurs.length) erreurs.push(...verifierPack(pack));

if (erreurs.length) {
  console.error(erreurs.map((e) => expliquer(e, pack.phrases)).join('\n'));
  console.error(`\n${erreurs.length} problème(s). Pack non écrit : l'ancien reste en place.`);
  console.error('Corriger corpus.csv (ou le tableur puis réimporter) et relancer.');
  process.exit(1);
}
writeFileSync(racine + 'packs/bum/pack.json', JSON.stringify(pack, null, 2) + '\n');
const validees = pack.phrases.filter((p) => p.valide).length;
const termes = pack.glossaire.filter((t) => t.bulu).length;
console.log(`${pack.phrases.length} phrases (${validees} validées), ${pack.glossaire.length} termes (${termes} traduits) -> packs/bum/pack.json`);
