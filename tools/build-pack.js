// packs/<langue>/ : corpus.csv + glossaire.csv + infos.json -> pack.json
// Usage : npm run pack [-- <langue>] [--strict] (la langue est facultative s'il n'y en a qu'une)
// --strict : refuse aussi le pack s'il reste un constat de révision bloquant (version finale).
// Le pack n'est écrit que s'il passe check-pack : un pack invalide ne remplace jamais le bon.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lireCsv } from './csv.js';
import { verifierPack } from './check-pack.js';
import { empreinte } from '../core/empreinte.ts';
import { choisirLangue, dossier } from './langues.js';
import { differences, entreeJournal, versionSuivante } from './versions.js';
import { resume, revisionOuverte } from './revision-donnees.js';
import { BLOQUANT } from './revision-commun.js';

const strict = process.argv.includes('--strict');
// Le format attendu est celui du schéma : un seul endroit à changer quand la forme du pack change
const FORMAT = JSON.parse(readFileSync(new URL('../packs/schema.json', import.meta.url), 'utf8')).properties.format.const;
const langue = choisirLangue(process.argv.slice(2).find((argument) => !argument.startsWith('--')));
const ici = dossier(langue);
const lire = (nom) => readFileSync(ici + nom, 'utf8');
const oui = (v) => ['1', 'oui', 'yes', 'x'].includes((v || '').trim().toLowerCase());
const infos = JSON.parse(lire('infos.json'));
// Les tableurs nomment la colonne de traduction d'après la langue : « TRADUCTION BULU », « Texte ewondo »…
const nomLangue = infos.nom.toLowerCase();

// Les locuteurs renomment parfois les en-têtes du tableur (le kit dit « TERME <LANGUE> APPROUVÉ »
// et « Choisi par », d'autres fichiers « TRADUCTION <LANGUE> » et « Traduit par »).
// Chaque champ accepte donc plusieurs débuts d'en-tête, sans tenir compte des majuscules.
const COLONNES_GLOSSAIRE = {
  ref: ['réf'],
  terme: ['terme français', 'catégorie'],
  en: ['anglais'],
  sens: ['sens dans', 'texte français'],
  critique: ['critique'],
  cible: [`terme ${nomLangue}`, `traduction ${nomLangue}`],
  a_eviter: ['mots à éviter'],
  traduit_par: ['traduit par', 'choisi par'],
  relu_par: ['relu par'],
  commentaire: ['commentaire'],
};
const COLONNES_CORPUS = ['id', 'fr', 'en', 'cible', 'critique', 'valide_par', 'valide'];
// retraduction.csv vient de tools/kit.py import (fichier de retraduction rempli)
const COLONNES_RETRADUCTION = {
  ref: ['réf'],
  cible: [`texte ${nomLangue}`],
  texte: ['votre traduction'],
  par: ['traduit par'],
};

const erreurs = [];

// Pour chaque champ, l'en-tête réel du fichier ; une colonne introuvable est une erreur,
// sinon la traduction du glossaire arriverait vide sans que personne ne le voie
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

// id -> { cible, texte, par } ; vide tant qu'aucune retraduction n'a été importée
function lireRetraductions() {
  if (!existsSync(ici + 'retraduction.csv')) return new Map();
  const lignes = lireCsv(lire('retraduction.csv'));
  if (!lignes.length) return new Map();
  const colonnes = trouverColonnes(Object.keys(lignes[0]), 'retraduction.csv', COLONNES_RETRADUCTION);
  const cellule = (ligne, champ) => (ligne[colonnes[champ]] || '').trim();
  return new Map(lignes
    .filter((l) => cellule(l, 'ref') && cellule(l, 'texte'))
    .map((l) => [cellule(l, 'ref'), { cible: cellule(l, 'cible'), texte: cellule(l, 'texte'), par: cellule(l, 'par') }]));
}

const retraductions = lireRetraductions();
const perimees = [];

// Une retraduction ne vaut que pour la traduction qui a été lue : si la phrase a changé depuis, on l'écarte
function retraductionDe(id, cible) {
  const r = retraductions.get(id);
  if (!r) return { retraduit_par: '', retraduction: '' };
  if (comparable(r.cible) !== comparable(cible)) {
    perimees.push(id);
    return { retraduit_par: '', retraduction: '' };
  }
  return { retraduit_par: r.par, retraduction: r.texte };
}

function versPhrase(ligne) {
  const cible = (ligne.cible || '').trim();
  return {
    id: ligne.id.trim(),
    fr: ligne.fr.trim(),
    en: (ligne.en || '').split('|').map((e) => e.trim()).filter(Boolean),
    cible,
    critique: ligne.critique.trim() === '1',
    ...personnes(ligne.valide_par),
    ...retraductionDe(ligne.id.trim(), cible),
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
  const variantes = lireVariantes();
  return lignes.map(versPhrase).map((p) => (variantes.has(p.id) ? { ...p, variantes: variantes.get(p.id) } : p));
}

// paraphrases.csv : autres formulations françaises d'une phrase (id, fr, propose_par, verifie_par).
// Une paraphrase n'entre dans le pack que vérifiée par un francophone de l'équipe qui ne l'a pas proposée :
// elle mènera à la traduction validée de sa phrase (niveau 3, core/sens.ts). Les noms restent ici.
const paraphrases = { verifiees: 0, enAttente: 0 };
function lireVariantes() {
  const variantes = new Map();
  if (!existsSync(ici + 'paraphrases.csv')) return variantes;
  for (const ligne of lireCsv(lire('paraphrases.csv'))) {
    const [id, fr, propose, verifie] = ['id', 'fr', 'propose_par', 'verifie_par'].map((c) => (ligne[c] || '').trim());
    if (!id || !fr) continue;
    if (!verifie || verifie.toLowerCase() === propose.toLowerCase()) {
      paraphrases.enAttente++;
      continue;
    }
    variantes.set(id, [...(variantes.get(id) || []), fr]);
    paraphrases.verifiees++;
  }
  return variantes;
}

// Message d'erreur suivi du texte concerné, pour que la correction se fasse sans chercher
function expliquer(erreur, phrases) {
  const phrase = phrases.find((p) => erreur.startsWith(p.id + ' :'));
  if (!phrase) return erreur;
  return `${erreur}\n    fr   : ${phrase.fr}\n    trad : ${phrase.cible || '(vide)'}`;
}

const { langue: code, nom, producteur, droits, orthographe, etiquettes } = infos;
const contenu = { glossaire: lireGlossaire(), phrases: lirePhrases() };
const ancien = existsSync(ici + 'pack.json') ? JSON.parse(lire('pack.json')) : null;
const changements = differences(ancien, { format: FORMAT, ...contenu, nom, producteur, droits, orthographe, etiquettes });
const version = ancien ? versionSuivante(ancien.version, changements) : '0.1.0';
const date = version === ancien?.version && ancien.date ? ancien.date : new Date().toISOString().slice(0, 10);
const pack = { format: FORMAT, langue: code, nom, version, date, empreinte: '', producteur, droits, orthographe, etiquettes, ...contenu };
pack.empreinte = await empreinte(pack);
if (!erreurs.length) erreurs.push(...verifierPack(pack));

if (erreurs.length) {
  console.error(erreurs.map((e) => expliquer(e, pack.phrases)).join('\n'));
  console.error(`\n${erreurs.length} problème(s). Pack non écrit : l'ancien reste en place.`);
  console.error(`Corriger packs/${langue}/corpus.csv (ou le tableur puis réimporter) et relancer.`);
  process.exit(1);
}
// Les constats de révision ne bloquent pas pendant que les locuteurs travaillent, sauf en --strict
const revision = revisionOuverte(pack, ici);
const bloquants = revision.filter((c) => c.niveau === BLOQUANT);
if (strict && bloquants.length) {
  console.error(bloquants.map((c) => `${c.ref} : ${c.explication}`).join('\n'));
  console.error(`\n${bloquants.length} constat(s) bloquant(s) (--strict). Pack non écrit : npm run revision.`);
  process.exit(1);
}
writeFileSync(ici + 'pack.json', JSON.stringify(pack, null, 2) + '\n');
archiver();
const validees = pack.phrases.filter((p) => p.valide).length;
const termes = pack.glossaire.filter((t) => t.cible).length;
const retraduites = pack.phrases.filter((p) => p.retraduction).length;
console.log(`${pack.phrases.length} phrases (${validees} validées, ${retraduites} retraduites), ${pack.glossaire.length} termes (${termes} traduits) -> packs/${langue}/pack.json`);
if (perimees.length) {
  console.log(`Retraduction à refaire (la traduction a changé depuis) : ${perimees.join(', ')}`);
}
if (paraphrases.verifiees || paraphrases.enAttente) {
  console.log(`Paraphrases : ${paraphrases.verifiees} vérifiées dans le pack, ${paraphrases.enAttente} à vérifier (paraphrases.csv)`);
}
if (revision.length) console.log(`${resume(revision)} : npm run revision`);

// Chaque version reste disponible (packs/<langue>/versions/) et le journal dit ce qui a changé
function archiver() {
  const archive = `${ici}versions/${version}.json`;
  if (existsSync(archive)) return;
  mkdirSync(ici + 'versions', { recursive: true });
  writeFileSync(archive, JSON.stringify(pack, null, 2) + '\n');
  const journal = ici + 'CHANGELOG.md';
  const entree = ancien?.date
    ? entreeJournal(version, date, changements)
    : `## ${version} (${date})\n- Première version suivie : ${pack.phrases.length} phrases, ${pack.glossaire.length} termes`;
  const titre = `# Journal du pack ${nom} (${code})\n\nUne correction de traduction augmente le dernier chiffre ; une phrase ou un terme ajouté ou retiré, celui du milieu.\n`;
  // Les entrées déjà écrites, à partir du premier « ## » (git peut avoir mis des fins de ligne Windows)
  const deja = existsSync(journal) ? readFileSync(journal, 'utf8').replace(/\r\n/g, '\n') : '';
  const avant = deja.includes('\n## ') ? deja.slice(deja.indexOf('\n## ') + 1) : '';
  writeFileSync(journal, `${titre}\n${entree}\n\n${avant}`);
  console.log(`Version ${version} : packs/${code}/versions/${version}.json, journal dans packs/${code}/CHANGELOG.md`);
}
