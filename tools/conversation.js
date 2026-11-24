// Assemble le noyau conversationnel pour une langue : pack validé, tableurs des locuteurs (réponses, menus,
// explications), vocabulaire de compréhension et banque simulée. Sert aux essais, aux scénarios du jury et,
// lancé seul, à converser dans le terminal :
//
//   npm run conversation [-- <langue>] [--canal ussd]     tapez une demande, Mayem répond ; « journal » montre la dernière ligne

import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { normaliser } from '../core/comprendre.ts';
import { souple } from '../core/langage.ts';
import { termeUtilisable } from '../core/termes.ts';
import { banqueSimulee } from '../service/banque.ts';
import { nouvelleSession, traiter } from '../service/conversation.ts';
import { creerReponses } from '../service/reponses.ts';
import { lireCsv } from './csv.js';
import { choisirLangue, dossier, racine } from './langues.js';

const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const lire = (chemin) => lireCsv(readFileSync(chemin, 'utf8'));

// Le vocabulaire français, avec le nom de la langue nationale à la place de {langue}
export function lexiqueFrancais(nom) {
  const brut = readFileSync(racine + 'service/lexique-fr.json', 'utf8').replaceAll('{langue}', nom.toLowerCase());
  const { _lisez_moi, ...lexique } = JSON.parse(brut);
  return lexique;
}

// Premier vocabulaire de la langue nationale : un mot-clé français fort qui est aussi un terme validé du glossaire
// prête son poids à la traduction de ce terme (« solde » -> sa traduction validée). Les formulations
// recueillies auprès des locuteurs (tableur « Comment les gens demandent ») viendront s'y ajouter.
export function lexiqueDuGlossaire(francais, pack) {
  const termes = new Map();
  for (const t of pack.glossaire.filter(termeUtilisable)) {
    for (const forme of t.terme.split('/')) termes.set(souple(forme.trim()), t.cible.split('/')[0].trim());
  }
  const intentions = {};
  for (const [intention, mots] of Object.entries(francais.intentions)) {
    for (const [mot, poids] of Object.entries(mots)) {
      const cible = poids >= 3 && termes.get(souple(mot));
      if (cible && normaliser(cible).length >= 3) (intentions[intention] ||= {})[normaliser(cible)] = poids;
    }
  }
  return { intentions, secondaires: [], periodes: {}, factures: {}, langues: {}, devises: [], multiplicateurs: {} };
}

const deuxNoms = (a, b) => Boolean(a && b && a.trim() && b.trim() && a.trim().toLowerCase() !== b.trim().toLowerCase());

// Ce que les locuteurs ont apporté pour comprendre la langue nationale (tableur des demandes), lu seulement quand
// les lignes portent deux noms différents. provisoire : toutes les lignes, pour mesurer, jamais pour la démonstration.
export function lexiqueDesLocuteurs(code, { provisoire = false } = {}) {
  const finale = dossier(code) + 'finale/';
  if (!existsSync(finale + 'comprendre.json') || !existsSync(finale + 'formulations.csv')) return null;
  const retenues = (nom) => (existsSync(finale + nom) ? lire(finale + nom) : []).filter((l) => provisoire || deuxNoms(l.ecrit_par, l.verifie_par));
  const { mots: sens, ignorer = {}, _lisez_moi, sources, ...marques } = lireJson(finale + 'comprendre.json');
  // Une demande qui mêle deux intentions (comprendre.json, « ignorer ») ne sert pas de modèle
  const formulations = retenues('formulations.csv').filter((l) => !ignorer[l.ref]).map(({ ref, intention, texte }) => ({ ref, intention, texte }));
  if (!formulations.length) return null;
  const intentions = {};
  for (const { ref, texte } of retenues('mots.csv')) {
    const mot = normaliser(texte.replace(/…/g, ' '));
    if (sens[ref] && mot.length >= 2) (intentions[sens[ref]] ||= {})[mot] = 3;
  }
  return { intentions, secondaires: ['oui', 'non', 'terminer', 'repeter'], devises: [], multiplicateurs: {}, ...marques, formulations };
}

// « solde » se reconnaît aussi sous sa traduction validée (« c'est quoi, mebal ? ») : formes ajoutées au terme
function avecTermeNational(terme, pack) {
  const traductions = pack.glossaire.filter(termeUtilisable)
    .filter((t) => t.terme.split('/').some((f) => terme.split('/').some((g) => souple(f.trim()) === souple(g.trim()))))
    .flatMap((t) => t.cible.split('/').map((c) => c.trim()));
  return [terme, ...new Set(traductions)].join(' / ');
}

// Explications des termes dans la langue nationale, signées de deux noms et non écartées à la relecture
export function explicationsValidees(code) {
  const finale = dossier(code) + 'finale/';
  if (!existsSync(finale + 'explications-recues.csv')) return new Map();
  const ecartees = new Set(existsSync(finale + 'exclusions.csv') ? lire(finale + 'exclusions.csv').map((l) => l.ref) : []);
  return new Map(lire(finale + 'explications-recues.csv')
    .filter((l) => deuxNoms(l.traduit_par, l.relu_par) && !ecartees.has(l.ref) && l.explication)
    .map((l) => [l.ref, l.explication]));
}

// Versions par canal (USSD, SMS, voix) signées de deux noms
export function variantesValidees(code) {
  const chemin = dossier(code) + 'finale/variantes.csv';
  return existsSync(chemin) ? lire(chemin).filter((v) => deuxNoms(v.traduit_par, v.relu_par)).map(({ ref, canal, cible }) => ({ ref, canal, cible })) : [];
}

export function chargerContexte(code = choisirLangue(), banque = banqueSimulee(lireJson(racine + 'service/banque-essai.json')), { provisoire = false } = {}) {
  const pack = lireJson(dossier(code) + 'pack.json');
  const finale = dossier(code) + 'finale/';
  const modeles = [...lire(finale + 'reponses.csv'), ...lire(finale + 'menus.csv')].map(({ ref, fr }) => ({ ref, fr }));
  const explications = lire(finale + 'termes.csv');
  const francais = lexiqueFrancais(pack.nom);
  return {
    banque,
    reponses: creerReponses(modeles, explications, pack, variantesValidees(code), explicationsValidees(code)),
    lexiques: [francais, lexiqueDuGlossaire(francais, pack), lexiqueDesLocuteurs(code, { provisoire })].filter(Boolean),
    termes: explications.map(({ ref, terme }) => ({ ref, terme: avecTermeNational(terme, pack) })),
    nationale: { code, nom: pack.nom },
    typesFacture: [{ type: 'electricite', ref: 'U14' }, { type: 'eau', ref: 'U15' }],
  };
}

async function converser() {
  const arguments_ = process.argv.slice(2);
  const canal = arguments_.includes('--canal') ? arguments_[arguments_.indexOf('--canal') + 1] : 'terminal';
  const code = choisirLangue(arguments_.find((a, i) => !a.startsWith('--') && arguments_[i - 1] !== '--canal'));
  const ctx = chargerContexte(code);
  const session = nouvelleSession('terminal', canal, 'fr');
  let derniere = null;
  console.log(`Mayem, banque simulée. Langue nationale : ${ctx.nationale.nom}. Tapez une demande (« journal » pour la dernière ligne, Ctrl+C pour quitter).`);
  const ligne = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  ligne.prompt();
  for await (const texte of ligne) {
    if (texte.trim() === 'journal') console.log(JSON.stringify(derniere, null, 2));
    else if (texte.trim()) {
      const tour = await traiter(ctx, session, texte);
      derniere = tour.journal;
      console.log(tour.texte.split('\n').map((l) => '  ' + l).join('\n'));
      console.log(`  [${tour.journal.intention} · ${tour.journal.statut}${tour.journal.empreinte ? ' · ' + tour.journal.empreinte : ''} · ${tour.journal.temps_ms} ms]`);
    }
    ligne.prompt();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) converser();
