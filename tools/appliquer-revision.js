// Applique packs/<langue>/reponses-revision.json (écrit par tools/kit.py import depuis le tableur de révision)
// aux fichiers de la langue, puis affiche ce qui a changé, ce qui attend un second nom et ce qui est refusé.
// Lancé par npm run import ; les règles sont dans tools/fusion-revision.js.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ecrireCsv, lireCsv } from './csv.js';
import { ENTETES_DECISIONS, lireDecisions } from './decisions.js';
import { fusionner } from './fusion-revision.js';
import { choisirLangue, dossier } from './langues.js';

const ici = dossier(choisirLangue(process.argv[2]));
const lire = (nom) => (existsSync(ici + nom) ? lireCsv(readFileSync(ici + nom, 'utf8')) : []);
const entetes = (nom) => (existsSync(ici + nom) ? Object.keys(lireCsv(readFileSync(ici + nom, 'utf8'))[0] || {}) : []);
const colonne = (noms, ...debuts) => noms.find((n) => debuts.some((d) => n.trim().toLowerCase().startsWith(d)));

function ajouter(nom, colonnes, lignes) {
  if (!lignes.length) return;
  writeFileSync(ici + nom, ecrireCsv(colonnes, [...lire(nom), ...lignes]));
}

const reponses = JSON.parse(readFileSync(ici + 'reponses-revision.json', 'utf8'));
const corpus = lire('corpus.csv');
const glossaire = lire('glossaire.csv');
const style = lire('style.csv');
const nomsGlossaire = entetes('glossaire.csv');
const colonnesGlossaire = {
  ref: colonne(nomsGlossaire, 'réf'), bulu: colonne(nomsGlossaire, 'terme bulu', 'traduction bulu'),
  traduit: colonne(nomsGlossaire, 'traduit par', 'choisi par'), relu: colonne(nomsGlossaire, 'relu par'),
};
const colonneReponse = colonne(entetes('style.csv'), 'votre réponse') || 'VOTRE RÉPONSE';
const rapport = fusionner({ corpus, glossaire, colonnesGlossaire, style, colonneReponse }, reponses, new Date().toISOString().slice(0, 10));

writeFileSync(ici + 'corpus.csv', ecrireCsv(entetes('corpus.csv'), corpus));
writeFileSync(ici + 'glossaire.csv', ecrireCsv(nomsGlossaire, glossaire));
writeFileSync(ici + 'style.csv', ecrireCsv(['Sujet', 'Question', colonneReponse], style));
ajouter('decisions.csv', ENTETES_DECISIONS, rapport.decisions.filter((d) => !lireDecisions(ici + 'decisions.csv').some((e) => e.code === d.code && e.ref === d.ref && e.bulu === d.bulu)));
ajouter('en-attente.csv', ['ref', 'ancien', 'nouveau', 'traduit_par', 'relu_par', 'date'], rapport.attente);
ajouter('commentaires.csv', ['ref', 'date', 'traduit_par', 'relu_par', 'commentaire'], rapport.commentaires);

// infos.json est publié : une réponse libre de la charte n'y est jamais recopiée, l'équipe le met à jour elle-même
const alphabet = (reponses.charte || []).find((r) => r.sujet === 'Orthographe' && r.reponse);
const infos = JSON.parse(readFileSync(ici + 'infos.json', 'utf8'));
rmSync(ici + 'reponses-revision.json');

const bloc = (titre, lignes) => lignes.length && console.log(`\n${titre} (${lignes.length}) :\n  ${lignes.join('\n  ')}`);
bloc('Traductions remplacées (deux personnes)', rapport.changements);
bloc('En attente d\'un second nom (l\'ancien bulu validé reste affiché) -> en-attente.csv', rapport.attente.map((a) => `${a.ref} : « ${a.nouveau} » (${a.traduit_par || a.relu_par || 'sans nom'})`));
bloc('Refusées, à renvoyer aux locuteurs', rapport.refus);
bloc('Charte d\'orthographe', rapport.charte);
bloc('Commentaires des locuteurs, à lire -> commentaires.csv', rapport.commentaires.map((c) => `${c.ref} : ${c.commentaire}`));
console.log(`\n${rapport.decisions.length} décision(s) « garder » notées.`);
if (alphabet) console.log(`Alphabet : infos.json dit « ${infos.orthographe} » ; à mettre à jour à la main si la réponse de la charte le change.`);
