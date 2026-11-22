// Assemble le noyau conversationnel pour une langue : pack validé, tableurs des locuteurs (réponses, menus,
// explications), vocabulaire de compréhension et banque simulée. Sert aux essais, aux scénarios du jury et,
// lancé seul, à converser dans le terminal :
//
//   npm run conversation [-- <langue>] [--canal ussd]     tapez une demande, Mayem répond ; « journal » montre la dernière ligne

import { readFileSync } from 'node:fs';
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

export function chargerContexte(code = choisirLangue(), banque = banqueSimulee(lireJson(racine + 'service/banque-essai.json'))) {
  const pack = lireJson(dossier(code) + 'pack.json');
  const finale = dossier(code) + 'finale/';
  const modeles = [...lire(finale + 'reponses.csv'), ...lire(finale + 'menus.csv')].map(({ ref, fr }) => ({ ref, fr }));
  const explications = lire(finale + 'termes.csv');
  const francais = lexiqueFrancais(pack.nom);
  return {
    banque,
    reponses: creerReponses(modeles, explications, pack),
    lexiques: [francais, lexiqueDuGlossaire(francais, pack)],
    termes: explications.map(({ ref, terme }) => ({ ref, terme })),
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
