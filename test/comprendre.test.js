// Compréhension d'une demande : intention, montants (chiffres et lettres), numéros, contacts, négation, valeurs
// écartées par une correction. Carnet fictif ; vocabulaire : service/lexique-fr.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comprendre, normaliser } from '../core/comprendre.ts';
import { nombresEnLettres } from '../core/nombres.ts';
import { readFileSync } from 'node:fs';
import { lexiqueFrancais } from '../tools/conversation.js';
import { lireCsv as lireCsvTexte } from '../tools/csv.js';

const lexique = lexiqueFrancais('Essai');
const carnet = [
  { id: 'a', nom: 'Paul Mbarga', alias: ['paul'], telephone: '677123456', type: 'mobile' },
  { id: 'b', nom: 'Paul Essomba', alias: ['paul'], telephone: '699112233', type: 'interne' },
  { id: 'c', nom: 'Pierre Owona', alias: ['pierre'], telephone: '678901234', type: 'mobile' },
  { id: 'd', nom: 'Marthe Ndzana', alias: ['maman', 'ma mere'], telephone: '655001122', type: 'mobile' },
];
const termes = [{ ref: 'E01', terme: 'solde' }, { ref: 'E02', terme: 'frais' }, { ref: 'E05', terme: 'bénéficiaire' }, { ref: 'E11', terme: 'solde insuffisant' }];
const lire = (texte) => comprendre(texte, { lexiques: [lexique], carnet, termes });

test('nombres en lettres : composés, « et », « quatre-vingt », et « un » seul ignoré', () => {
  const valeurs = (texte) => nombresEnLettres(texte).map((n) => n.valeur);
  assert.deepEqual(valeurs('deux mille cinq cents'), [2500]);
  assert.deepEqual(valeurs('soixante et onze mille'), [71000]);
  assert.deepEqual(valeurs('quatre-vingt-dix-neuf'), [99]);
  assert.deepEqual(valeurs('un million deux cent mille'), [1200000]);
  assert.deepEqual(valeurs('un ami et une facture'), []);
});

test('normalisation : casse, accents, apostrophes et séparateurs de milliers', () => {
  assert.equal(normaliser("C'était 10.000 F à l'Église"), 'c etait 10 000 f a l eglise');
});

// Les exemples du tableur « Comment les gens demandent », chacun avec l'intention que Mayem doit retenir
const DEMANDES = [
  ['Combien il me reste ?', 'solde'], ['Est-ce que j\'ai assez pour envoyer 20 000 ?', 'solde'],
  ['Bonjour, je voudrais connaître mon solde s\'il vous plaît.', 'solde'], ['Montre-moi mes dernières opérations.', 'historique'],
  ['Est-ce que l\'argent de mon frère est arrivé ?', 'historique'], ['Combien j\'ai dépensé cette semaine ?', 'depenses'],
  ['C\'était combien mon dernier envoi ?', 'historique'], ['Envoie 5 000 à Paul.', 'transfert'],
  ['Envoie 10 000 au 677 12 34 56.', 'transfert'], ['Envoie deux mille cinq cents à maman.', 'transfert'],
  ['Je veux envoyer de l\'argent à Marie.', 'transfert'], ['Envoie 3 000.', 'transfert'],
  ['Envoie 15 000 à Jean pour la scolarité.', 'transfert'], ['Ça coûte combien pour envoyer 50 000 à mon oncle ?', 'frais'],
  ['Quels sont les frais pour 50 000 ?', 'frais'], ['Pourquoi on m\'a pris plus que ce que j\'ai envoyé ?', 'frais'],
  ['C\'est gratuit d\'envoyer à un compte de la même banque ?', 'frais'], ['Mets-moi 1 000 de crédit.', 'credit'],
  ['Envoie 500 de crédit au 699 00 11 22.', 'credit'], ['Je veux payer ma facture d\'électricité.', 'facture'],
  ['Payer la facture d\'eau.', 'facture'], ['Paie la facture 458 221.', 'facture'],
  ['Ça veut dire quoi, frais ?', 'expliquer'], ['C\'est quoi le solde ?', 'expliquer'], ['Un bénéficiaire, c\'est qui ?', 'expliquer'],
  ['Non, pas 5 000, 10 000.', 'corriger'], ['Non, pas à Paul, à Pierre.', 'corriger'], ['Je me suis trompé de numéro.', 'corriger'],
  ['Laisse, j\'annule.', 'annuler'], ['Parle-moi en français.', 'langue'], ['Reviens à notre langue.', 'langue'],
  ['Répète, je n\'ai pas compris.', 'repeter'], ['Qu\'est-ce que je peux faire ici ?', 'aide'], ['Bonjour.', 'saluer'],
  ['Merci, au revoir.', 'terminer'], ['N\'envoie pas l\'argent à Paul.', 'transfert'],
];

test('les 36 exemples du tableur des demandes reçoivent la bonne intention', () => {
  for (const [texte, attendue] of DEMANDES) assert.equal(lire(texte).intention, attendue, texte);
});

test('montants : chiffres, « 5 mille », lettres, devise collée ; petits nombres comptés à part', () => {
  const montants = (texte) => lire(texte).montants.map((v) => v.valeur);
  assert.deepEqual(montants('Envoie 5 mille à Paul'), [5000]);
  assert.deepEqual(montants('envoie 5000f à Pierre'), [5000]);
  assert.deepEqual(montants('Envoie deux mille cinq cents à maman'), [2500]);
  assert.deepEqual(montants('10.000 FCFA à Pierre'), [10000]);
  assert.deepEqual(lire('mes 3 dernières opérations').nombres.map((v) => v.valeur), [3]);
  assert.deepEqual(lire('mes 3 dernières opérations').montants, []);
});

test('numéros camerounais avec ou sans indicatif ; une somme suivie d\'une devise n\'est pas un numéro', () => {
  assert.deepEqual(lire('envoie 5000 au +237 677-12-34-56').telephones.map((t) => t.numero), ['677123456']);
  assert.deepEqual(lire('Envoie 10 000 au 677 12 34 56').telephones.map((t) => t.numero), ['677123456']);
  assert.deepEqual(lire('Envoie 10 000 au 677 12 34 56').montants.map((v) => v.valeur), [10000]);
  assert.deepEqual(lire('envoie 650 000 000 F').telephones, []);
});

test('contacts : deux « Paul » restent ambigus, le nom complet tranche, les alias de parenté sont reconnus', () => {
  assert.deepEqual(lire('Envoie 5 000 à Paul').contacts[0].contacts.map((c) => c.id), ['a', 'b']);
  assert.deepEqual(lire('Envoie 5 000 à Paul Mbarga').contacts.map((m) => m.contacts.map((c) => c.id)), [['a']]);
  assert.deepEqual(lire('Envoie 2 000 à ma mère').contacts[0].contacts.map((c) => c.id), ['d']);
});

test('correction : la valeur écartée (« pas 5 000 », « pas à Paul ») est marquée, la nouvelle est gardée', () => {
  const montants = lire('Non, pas 5 000, 10 000').montants;
  assert.deepEqual(montants.map((v) => [v.valeur, v.rejete]), [[5000, true], [10000, false]]);
  const contacts = lire('Non, pas à Paul, à Pierre').contacts;
  assert.deepEqual(contacts.map((m) => [m.contacts[0].id, m.rejete]), [['a', true], ['c', false]]);
  assert.deepEqual(lire('10 000 au lieu de 5 000').montants.map((v) => v.rejete), [false, true]);
});

test('négation d\'une action repérée ; « je n\'ai pas compris » n\'en est pas une', () => {
  assert.equal(lire('N\'envoie pas l\'argent à Paul').negation, true);
  assert.equal(lire('Surtout pas, ne paie pas la facture').negation, true);
  assert.equal(lire('Répète, je n\'ai pas compris').negation, false);
  assert.equal(lire('Envoie 5 000 à Paul').negation, false);
});

test('une somme et un bénéficiaire sans verbe valent un transfert ; une demande sans mot connu reste sans intention', () => {
  const sansVerbe = lire('10 000 FCFA à Pierre');
  assert.equal(sansVerbe.intention, 'transfert');
  assert.match(sansVerbe.raison, /somme et un bénéficiaire/);
  assert.equal(lire('le ciel est bleu').intention, null);
});

test('facture, type de facture, période, langue demandée et touche de menu', () => {
  assert.equal(lire('Paie la facture 458 221').facture, '458221');
  assert.equal(lire('Je veux payer ma facture d\'électricité').typeFacture, 'electricite');
  assert.equal(lire('Combien j\'ai dépensé cette semaine ?').periode, 'semaine');
  assert.equal(lire('Parle-moi en français').langue, 'fr');
  assert.equal(lire('Reviens à notre langue').langue, 'nationale');
  assert.equal(lire('2').touche, '2');
});

test('chaque intention retenue dit pourquoi', () => {
  assert.match(lire('Envoie 5 000 à Pierre').raison, /^mots reconnus : envoie/);
});

// Lexique d'une langue d'essai, sur le modèle des données des locuteurs : formulations, négation, mots qui écartent
const locuteurs = {
  intentions: { oui: { 'e yebe': 3 } }, secondaires: ['oui'], periodes: { 'sondo nyii': 'semaine' }, factures: {}, langues: { fulasi: 'fr' },
  devises: [], multiplicateurs: {}, negations: ['te lom'], ecartent: ['sa ake'], liaisons: ['be'],
  formulations: [
    { ref: 'A1', intention: 'transfert', texte: 'Lôm Paul 5 000 F' }, { ref: 'A2', intention: 'transfert', texte: 'Ma kômbô lôm moné' },
    { ref: 'B1', intention: 'solde', texte: 'Moné wôm a lyii ya tañ yà ?' }, { ref: 'C1', intention: 'aide', texte: 'Ma yii mvolan' },
  ],
};
const lireLangue = (texte) => comprendre(texte, { lexiques: [lexique, locuteurs], carnet, termes });

test('formulations des locuteurs : une demande proche en prend l\'intention, et dit de laquelle elle est proche', () => {
  const c = lireLangue('lôm Pierre 3 000 F');
  assert.equal(c.intention, 'transfert');
  assert.match(c.raison, /proche de A1/);
  assert.deepEqual(c.montants.map((v) => v.valeur), [3000]);
  assert.equal(lireLangue('moné wôm a lyii tañ ?').intention, 'solde');
  assert.equal(lireLangue('e yebe').intention, 'oui');
  assert.equal(lireLangue('kôbo fulasi').langue, 'fr');
});

test('marques de la langue : négation (« te lôm ») et valeur écartée (« sa\'ake Paul ») viennent des données', () => {
  assert.equal(lireLangue('te lôm Paul moné').negation, true);
  const correction = lireLangue('lôm Pierre, sa\'ake be Paul');
  assert.deepEqual(correction.contacts.map((m) => [m.contacts[0].id, m.rejete]), [['c', false], ['a', true]]);
});

test('sans formulation assez proche, ou avec deux intentions trop proches, aucune intention n\'est retenue', () => {
  assert.equal(lireLangue('akut akut akut').intention, null);
});

test('intentions de l\'argent mobile et de la téléphonie, comprises en français (socle flux/argent-mobile)', () => {
  const lignes = readFileSync(new URL('../flux/argent-mobile/demandes.csv', import.meta.url), 'utf8');
  const situations = lireCsvTexte(lignes);
  for (const s of situations) {
    const c = lire(s.exemple_fr);
    if (s.a_noter.includes('ambiguë')) assert.equal(c.intention, null, s.ref);
    else assert.equal(c.intention, s.intention, `${s.ref} « ${s.exemple_fr} »`);
  }
});

// Lexique d'essai aux mots inventés : les règles valent pour toute langue, sans en nommer aucune
const essai = (formulations = [], intentions = {}, textes = []) => ({ intentions, secondaires: [], periodes: {}, factures: {}, langues: {}, devises: [], multiplicateurs: {}, formulations, textes });

test('une lettre près, seulement sur un mot long inconnu, et jamais deux fois pour le même mot', () => {
  const lexiques = [essai([], { facture: { zorblak: 3 }, transfert: { kavu: 3, envoyer: 3, envoyez: 3 } })];
  assert.equal(comprendre('je veux zorbllak', { lexiques }).intention, 'facture', 'une lettre de plus sur un mot long');
  assert.equal(comprendre('je veux kavo', { lexiques }).intention, null, 'un mot court à une lettre près est un autre mot');
  assert.equal(comprendre('envoyer', { lexiques }).score, 3, '« envoyer » reconnu ne compte pas une seconde fois pour « envoyez »');
});

test('demande d\'explication : le terme compte comme une case, mais seulement si la demande nomme un terme', () => {
  // « ne », « je » : courants dans la langue ; sans la règle, une formulation privée de son terme ne garderait qu'eux
  const courants = Array.from({ length: 10 }, (_, i) => `ne je mot${i}`);
  const lexiques = [essai([{ ref: 'D1', intention: 'expliquer', texte: 'zorblak kopa lim ne je' }, { ref: 'D2', intention: 'aide', texte: 'pakul tef' }], {}, courants)];
  const termesEssai = [{ ref: 'E1', terme: 'zorblak / kopa lim' }, { ref: 'E2', terme: 'plafond' }];
  assert.equal(comprendre('ne je plafond', { lexiques, termes: termesEssai }).intention, 'expliquer', 'un autre terme, la même demande');
  assert.equal(comprendre('ne je mipo', { lexiques, termes: termesEssai }).intention, null, 'sans terme, de petits mots ne suffisent pas');
});

test('les mots courants dans les textes validés de la langue pèsent peu dans la comparaison des demandes', () => {
  const formulations = [{ ref: 'D1', intention: 'transfert', texte: 'te wo zorba moni' }, { ref: 'D2', intention: 'solde', texte: 'kelim moni ane' }];
  const courants = Array.from({ length: 30 }, (_, i) => `te wo mot${i}`);
  const sans = comprendre('te wo pakul', { lexiques: [essai(formulations)] });
  const avec = comprendre('te wo pakul', { lexiques: [essai(formulations, {}, courants)] });
  assert.equal(sans.intention, 'transfert', 'sans textes, deux petits mots communs suffisent');
  assert.equal(avec.intention, null, 'avec les textes validés, ils ne décident plus seuls');
});
