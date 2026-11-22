// Les dix scénarios standardisés de la finale SAFINUM, rejoués sur la banque simulée.
// Chaque étape dit ce qui est attendu ; les tests (test/conversation.test.js) le vérifient, et
//
//   npm run scenarios [-- <langue>]      montre chaque conversation et sa ligne de journal.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { banqueSimulee } from '../service/banque.ts';
import { nouvelleSession, traiter } from '../service/conversation.ts';
import { chargerContexte } from './conversation.js';
import { choisirLangue, racine } from './langues.js';

// statut : statut de la transaction ; refs : réponses attendues, dans l'ordre ; parametres : valeurs extraites
export const SCENARIOS = [
  { nom: 'Consultation du solde', etapes: [
    { dire: 'Combien il me reste sur mon compte ?', intention: 'solde', statut: 'information', refs: ['RF010'], parametres: { solde: 85000 } },
  ] },
  { nom: 'Transfert d\'argent', etapes: [
    { dire: 'Envoie 5 000 à Pierre', intention: 'transfert', statut: 'en_attente_confirmation', refs: ['RF032', 'RF033'],
      parametres: { montant: 5000, beneficiaire: 'Pierre Owona', telephone: '678901234', frais: 100, total: 5100 } },
    { dire: 'Oui', intention: 'oui', statut: 'executee', refs: ['RF034', 'RF035'] },
  ] },
  { nom: 'Consultation des frais', etapes: [
    { dire: 'Quels sont les frais pour envoyer 50 000 ?', intention: 'frais', statut: 'information', refs: ['RF070', 'RF071'], parametres: { montant: 50000, frais: 500, total: 50500 } },
  ] },
  { nom: 'Historique des transactions', etapes: [
    { dire: 'Montre-moi mes 3 dernières opérations', intention: 'historique', statut: 'information', refs: ['RF020', 'RF022', 'RF021', 'RF023'], parametres: { nombre: 3 } },
  ] },
  { nom: 'Correction d\'une requête', etapes: [
    { dire: 'Envoie 5 000 à Paul', intention: 'transfert', statut: 'clarification', refs: ['RF050', 'faits', 'faits'] },
    { dire: '1', statut: 'en_attente_confirmation', refs: ['RF032', 'RF033'], parametres: { montant: 5000, beneficiaire: 'Paul Mbarga' } },
    { dire: 'Non, pas 5 000, 10 000', intention: 'corriger', statut: 'en_attente_confirmation', refs: ['RF040', 'RF032', 'RF033'], parametres: { montant: 10000, total: 10100 } },
    { dire: 'Oui, je confirme', intention: 'oui', statut: 'executee', refs: ['RF034', 'RF035'], parametres: { montant: 10000 } },
  ] },
  { nom: 'Requête ambiguë', etapes: [
    { dire: 'Je veux envoyer de l\'argent à Paul', intention: 'transfert', statut: 'clarification', refs: ['RF030'] },
    { dire: '3 000', statut: 'clarification', refs: ['RF050', 'faits', 'faits'] },
    { dire: '2', statut: 'en_attente_confirmation', refs: ['RF032', 'RF033'], parametres: { beneficiaire: 'Paul Essomba', frais: 0, total: 3000 } },
    { dire: 'Non', intention: 'non', statut: 'annulee', refs: ['RF066'] },
  ] },
  { nom: 'Solde insuffisant', etapes: [
    { dire: 'Envoie 100 000 à Marie', intention: 'transfert', statut: 'refusee', refs: ['RF060', 'RF061'], parametres: { montant: 100000, total: 100000 } },
    { dire: 'Alors envoie 50 000', intention: 'transfert', statut: 'en_attente_confirmation', refs: ['RF040', 'RF032', 'RF033'], parametres: { montant: 50000, beneficiaire: 'Marie Abena' } },
  ] },
  { nom: 'Changement de langue', etapes: [
    { dire: 'Envoie 2 000 à maman', intention: 'transfert', statut: 'en_attente_confirmation', refs: ['RF032', 'RF033'] },
    { dire: 'Reviens à notre langue', intention: 'langue', statut: 'en_attente_confirmation', refs: ['RF100', 'RF032', 'RF033'], langue: 'nationale' },
    { dire: 'Oui', intention: 'oui', statut: 'executee', refs: ['RF034', 'RF035'], langue: 'nationale', parametres: { montant: 2000, beneficiaire: 'Marthe Ndzana' } },
    { dire: 'Parle-moi en français', intention: 'langue', statut: 'information', refs: ['RF100'], langue: 'fr' },
  ] },
  { nom: 'Interaction multicanale', canaux: ['mobile', 'web', 'ussd'], etapes: [
    { dire: 'Envoie 5 000 à Pierre', intention: 'transfert', statut: 'en_attente_confirmation', refs: ['RF032', 'RF033'] },
  ] },
  { nom: 'Compréhension de la terminologie financière', etapes: [
    { dire: 'C\'est quoi les frais ?', intention: 'expliquer', statut: 'information', refs: ['E02'] },
  ] },
];

const banqueNeuve = () => banqueSimulee(JSON.parse(readFileSync(racine + 'service/banque-essai.json', 'utf8')));

// Rejoue un scénario sur une banque neuve, une fois par canal ; rend les tours de chaque canal
export async function rejouer(scenario, code) {
  const parCanal = {};
  for (const canal of scenario.canaux || ['web']) {
    const ctx = chargerContexte(code, banqueNeuve());
    const session = nouvelleSession(`${scenario.nom} · ${canal}`, canal, 'fr');
    parCanal[canal] = [];
    for (const etape of scenario.etapes) parCanal[canal].push({ etape, tour: await traiter(ctx, session, etape.dire) });
  }
  return parCanal;
}

async function montrer() {
  const code = choisirLangue(process.argv[2]);
  for (const scenario of SCENARIOS) {
    console.log(`\n=== ${scenario.nom} ===`);
    for (const [canal, tours] of Object.entries(await rejouer(scenario, code))) {
      for (const { etape, tour } of tours) {
        const j = tour.journal;
        console.log(`[${canal}] > ${etape.dire}`);
        console.log(tour.texte.split('\n').map((l) => '    ' + l).join('\n'));
        console.log(`    intention : ${j.intention} (${j.raison}) · statut : ${j.statut} · ${j.validation}`);
        console.log(`    paramètres : ${JSON.stringify(j.parametres)}${j.empreinte ? ' · empreinte : ' + j.empreinte : ''} · ${j.temps_ms} ms`);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) montrer();
