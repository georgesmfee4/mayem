// Import d'un lexique relu par les locuteurs (format « mayem-lexique ») dans packs/<langue>/.
// Usage : npm run lexique -- fichier.json [--retenir REF1,REF2]
// - seules les entrées « valide », traduites et relues par deux personnes différentes, entrent ;
// - un terme va dans glossaire.csv ; une phrase complète (majuscule et point final, ou champ {…}) dans corpus.csv ;
// - rien n'est jamais remplacé : un français déjà présent garde sa traduction, l'entrée est signalée ;
// - une entrée dont les chiffres ou les champs {…} diffèrent entre le français et la traduction est refusée.
// --retenir : entrées valides que l'équipe préfère faire trancher avant de les ajouter.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ecrireCsv, lireCsv } from './csv.js';
import { choisirLangue, dossier } from './langues.js';
import { memesChiffres } from '../core/faits.ts';

const net = (s) => (s || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const comparable = (s) => net(s).toLowerCase().replace(/[.!?:;]+$/, '').trim();
// Formes d'un terme (« carte bancaire / carte prépayée ») ; moins de 3 lettres : trop court pour juger.
// « il / elle reçoit » ne coupe que le pronom (la dernière forme, plus longue, porte la suite commune) :
// seul le terme entier compte. « crédit téléphonique / recharge » reste deux formes.
const nbMots = (s) => s.split(' ').length;
function formes(terme) {
  const parties = terme.split('/').map(comparable);
  const derniere = parties[parties.length - 1];
  if (parties.length > 1 && nbMots(derniere) > Math.max(...parties.slice(0, -1).map(nbMots))) return [comparable(terme)];
  return parties.filter((forme) => forme.length >= 3);
}
const champs = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
const nom = (s) => net(s).charAt(0).toUpperCase() + net(s).slice(1).toLowerCase();

export const estPhraseComplete = (fr) => /\{\w+\}/.test(fr) || (/^\p{Lu}/u.test(fr) && /[.!?]$/.test(fr.trim()));
export const memesValeurs = (fr, cible) => champs(fr) === champs(cible) && memesChiffres(fr, cible);

// Où le français existe déjà : glossaire (une de ses formes) ou corpus (la phrase entière)
export function dejaPresent(entree, glossaire, corpus) {
  const terme = glossaire.find((t) => formes(t.terme).some((forme) => formes(entree.fr).includes(forme)));
  if (terme) return { ref: terme.ref, cible: terme.cible };
  const phrase = corpus.find((p) => comparable(p.fr) === comparable(entree.fr) || formes(entree.fr).includes(comparable(p.fr)));
  return phrase ? { ref: phrase.id, cible: phrase.cible } : null;
}

export function trier(lexique, glossaire, corpus, retenues = []) {
  const bilan = { termes: [], phrases: [], dejaLa: [], gardees: [], refusees: [], retenues: [], ecartees: [] };
  const refs = new Set([...glossaire.map((t) => t.ref), ...corpus.map((p) => p.id)]);
  for (const e of lexique.entrees) {
    if (e.statut !== 'valide') { bilan.ecartees.push(e); continue; }
    if (retenues.includes(e.id)) { bilan.retenues.push(e); continue; }
    if (refs.has(e.id)) { bilan.dejaLa.push({ e, ref: e.id }); continue; }
    if (!net(e.traduit_par) || !net(e.relu_par) || comparable(e.traduit_par) === comparable(e.relu_par)) { bilan.refusees.push({ e, raison: 'deux noms différents manquent' }); continue; }
    if (!memesValeurs(e.fr, e.bulu)) { bilan.refusees.push({ e, raison: 'chiffres ou champs {…} différents' }); continue; }
    const present = dejaPresent(e, glossaire, corpus);
    if (present) { (comparable(present.cible) === comparable(e.bulu) ? bilan.dejaLa : bilan.gardees).push({ e, ...present }); continue; }
    (estPhraseComplete(e.fr) && !/ \/ |—/.test(e.fr) ? bilan.phrases : bilan.termes).push(e);
  }
  return bilan;
}

function lignesGlossaire(termes, entetes, date) {
  const [ref, terme, , sens, critique, cible, , traduit, relu, commentaire] = entetes;
  const lignes = [{ [terme]: `Lexique relu (${date})` }];
  let theme = '';
  for (const e of termes) {
    if (e.theme !== theme) lignes.push({ [terme]: (theme = e.theme) });
    lignes.push({ [ref]: e.id, [terme]: net(e.fr), [sens]: net(e.contexte), [critique]: e.critique ? 'Oui' : 'Non',
      [cible]: e.bulu, [traduit]: nom(e.traduit_par), [relu]: nom(e.relu_par), [commentaire]: e.corrige_par_relecteur ? 'Corrigé par le relecteur' : '' });
  }
  return lignes;
}

const lignePhrase = (e) => ({ id: e.id, priorite: 'P2', ecran: e.theme, element: 'Message', critique: e.critique ? '1' : '0',
  champ_fait: /\{\w+\}/.test(e.fr) ? '1' : '0', fr: net(e.fr), en: '', cible: e.bulu,
  valide_par: `${nom(e.traduit_par)} / relu par ${nom(e.relu_par)}`, valide: '1', consigne: net(e.contexte) });

function afficher(bilan) {
  const liste = (titre, lignes) => lignes.length && console.log(`\n${titre} (${lignes.length}) :\n${lignes.join('\n')}`);
  console.log(`${bilan.termes.length} termes -> glossaire.csv ; ${bilan.phrases.length} phrases -> corpus.csv`);
  liste('Déjà présentes, même traduction', bilan.dejaLa.map(({ e, ref }) => `  ${e.id} « ${e.fr} » (${ref})`));
  liste('Français déjà présent avec une autre traduction : la version du projet est gardée', bilan.gardees.map(({ e, ref, cible }) => `  ${e.id} « ${e.fr} » : « ${e.bulu} » ; le projet (${ref}) dit « ${cible} »`));
  liste('Refusées', bilan.refusees.map(({ e, raison }) => `  ${e.id} « ${e.fr} » : ${raison}`));
  liste('Retenues, à trancher', bilan.retenues.map((e) => `  ${e.id} « ${e.fr} » = « ${e.bulu} »`));
  liste('Non ajoutées (statut du lexique)', bilan.ecartees.map((e) => `  ${e.id} [${e.statut}] « ${e.fr} » : ${e.raison || ''}`));
}

function importer(fichier, retenues) {
  const lexique = JSON.parse(readFileSync(fichier, 'utf8'));
  if (lexique.format !== 'mayem-lexique') throw new Error(`${fichier} : format « mayem-lexique » attendu`);
  const ici = dossier(choisirLangue(lexique.langue?.code));
  const glossaireBrut = lireCsv(readFileSync(ici + 'glossaire.csv', 'utf8'));
  const entetes = Object.keys(glossaireBrut[0]);
  // Colonnes lues par leur place : réf., terme, anglais, sens, critique, traduction, à éviter, traduit, relu, commentaire
  if (entetes.length < 10 || !/^r[ée]f/i.test(entetes[0]) || !/traduction/i.test(entetes[5])) throw new Error('glossaire.csv : colonnes inattendues');
  const glossaire = glossaireBrut.filter((l) => net(l[entetes[0]])).map((l) => ({ ref: net(l[entetes[0]]), terme: l[entetes[1]], cible: l[entetes[5]] }));
  const corpusBrut = lireCsv(readFileSync(ici + 'corpus.csv', 'utf8'));
  const bilan = trier(lexique, glossaire, corpusBrut, retenues);
  if (bilan.termes.length) writeFileSync(ici + 'glossaire.csv', ecrireCsv(entetes, [...glossaireBrut, ...lignesGlossaire(bilan.termes, entetes, lexique.date)]));
  if (bilan.phrases.length) writeFileSync(ici + 'corpus.csv', ecrireCsv(Object.keys(corpusBrut[0]), [...corpusBrut, ...bilan.phrases.map(lignePhrase)]));
  afficher(bilan);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--retenir');
  const retenues = i >= 0 ? args.splice(i, 2)[1].split(',') : [];
  if (!args[0]) { console.error('Usage : npm run lexique -- fichier.json [--retenir REF1,REF2]'); process.exit(1); }
  importer(args[0], retenues);
}
