// Mayem en couche intermédiaire, joué contre une copie locale de la passerelle des canaux et de l'API bancaire du bac
// à sable (fixtures/services/banque-distante.js) : contrat de réponse, intentions standard, identifiant du tour sur
// chaque appel bancaire, opération confirmée au tour suivant seulement, scénarios du jury. Données fictives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { banqueSimulee } from '../service/banque.ts';
import { ajuster, horsGsm7, septets } from '../service/gsm7.ts';
import { creerPasserelle } from '../service/passerelle.ts';
import { banqueDistante } from '../fixtures/services/banque-distante.js';
import { chargerContexte } from '../tools/conversation.js';

const lire = (chemin) => JSON.parse(readFileSync(new URL(chemin, import.meta.url), 'utf8'));
const pack = lire('../packs/bum/pack.json');
const profil = lire('../profiles/safinum.json');
const CLE = 'sbx_essai_fictive';
const INTENTIONS = ['BALANCE_INQUIRY', 'TRANSFER', 'FEE_INQUIRY', 'TRANSACTION_HISTORY', 'AIRTIME_PURCHASE', 'BILL_PAYMENT', 'CONFIRM',
  'CANCEL', 'CORRECTION', 'CLARIFICATION_NEEDED', 'TERM_EXPLANATION', 'LANGUAGE_SWITCH', 'UNKNOWN'];
const CONTRAINTES = {
  ussd: { max_chars: 182, charset: 'gsm7', mode: 'menu', timeout_ms: 3000 },
  mobile: { max_chars: 1000, charset: 'utf8', mode: 'free', timeout_ms: 10000 },
  web: { max_chars: 2000, charset: 'utf8', mode: 'free', timeout_ms: 10000 },
};

function conforme(r, contraintes) {
  assert.equal(typeof r.response.text, 'string');
  assert.equal(typeof r.response.end_session, 'boolean');
  assert.ok(Array.isArray(r.response.options));
  assert.ok(INTENTIONS.includes(r.interpretation.intent), `intention hors liste : ${r.interpretation.intent}`);
  assert.ok(Object.values(profil.middleware.statuts).includes(r.transaction.status));
  assert.ok(septets(r.response.text) <= contraintes.max_chars, `${septets(r.response.text)} septets`);
  assert.doesNotMatch(r.response.text, /[A-Z]{3,}_[A-Z]{3,}/, 'un code d\'erreur de la banque n\'est jamais montré');
}

function monter({ appeler } = {}) {
  const banque = banqueDistante({ cle: CLE });
  const base = profil.middleware.banque.base;
  const adresses = [];
  const versBanque = appeler || (async (url, init) => {
    adresses.push(String(url));
    return banque.traiter(new Request(String(url).replace(base, 'http://banque.test/api/v1'), init));
  });
  const ctx = chargerContexte('bum', banqueSimulee(lire('../service/banque-essai.json')));
  const passerelle = creerPasserelle({ ctx, pack, profil, appeler: versBanque, cleBanque: CLE });
  let n = 0;
  // Un tour de la passerelle des canaux : un nouvel identifiant à chaque tour, comme la leur
  async function tour(texte, { canal = 'web', langue = 'fr', telephone = '237690000001' } = {}) {
    const trace = `trace-${++n}`;
    const corps = {
      trace_id: trace, team_id: 'mayem', channel: canal, session_id: `session-${canal}`, phone: telephone, language: langue,
      input: { type: canal === 'ussd' ? 'menu' : 'text', text: texte, ussd_text: texte }, constraints: CONTRAINTES[canal],
      bank_api: { base_url: 'https://ailleurs.example/api/v1' },
    };
    const reponse = await passerelle.traiter(new Request('http://mayem.test/v1/middleware', { method: 'POST', body: JSON.stringify(corps) }));
    assert.equal(reponse.status, 200);
    const r = await reponse.json();
    conforme(r, CONTRAINTES[canal]);
    return { ...r, trace, appels: banque.appels.filter((a) => a.trace === trace) };
  }
  return { tour, banque, adresses, ctx };
}

const appelle = (r, methode, chemin) => r.appels.some((a) => a.methode === methode && (chemin instanceof RegExp ? chemin.test(a.chemin) : a.chemin === chemin));

test('longueurs USSD comptées en septets ; lettres hors de l\'alphabet GSM-7 repérées ; un écran trop long perd ses dernières lignes', () => {
  assert.equal(septets('Total : 5 €'), 12, '« € » compte pour deux');
  assert.deepEqual(horsGsm7('Mbôlô, Ça va ?'), ['ô']);
  assert.equal(ajuster('première\ndeuxième\ntroisième', 18), 'première\ndeuxième');
  assert.equal(ajuster('une ligne trop longue', 5), 'une ligne trop longue', 'la première ligne n\'est jamais coupée');
});

test('consultation du solde : intention standard, réponse dans la langue, appel bancaire avec la clé et l\'identifiant du tour', async () => {
  const { tour, adresses } = monter();
  const fr = await tour('Quel est mon solde ?');
  assert.equal(fr.interpretation.intent, 'BALANCE_INQUIRY');
  assert.match(fr.response.text, /85 000 FCFA/);
  assert.ok(appelle(fr, 'GET', 'accounts/690000001'));
  assert.ok(fr.appels.every((a) => a.cle), 'la clé de l\'équipe sur chaque appel');
  const bulu = await tour('mebal môé', { langue: 'bum', telephone: '237690000001' });
  assert.equal(bulu.interpretation.language, 'bum');
  assert.doesNotMatch(bulu.response.text, /Votre solde/);
  assert.ok(adresses.every((a) => a.startsWith(profil.middleware.banque.base)), 'la clé ne part que vers la banque du profil, jamais vers l\'adresse reçue');
});

test('transfert en deux tours : préparé au récapitulatif sans rien débiter, confirmé au tour suivant avec un autre identifiant', async () => {
  const { tour, banque } = monter();
  const recap = await tour('Envoie 5 000 à Pierre');
  assert.equal(recap.interpretation.intent, 'TRANSFER');
  assert.equal(recap.transaction.status, 'pending');
  assert.deepEqual(recap.interpretation.parameters, { amount: 5000, currency: 'XAF', beneficiary: 'Pierre Owona', fee: 50, total: 5050 });
  assert.ok(appelle(recap, 'POST', 'transactions'));
  assert.match(recap.response.text, /5 050 FCFA/, 'frais et total de la banque du service');
  assert.equal(banque.solde(), 85000, 'rien n\'est débité au récapitulatif');
  const fait = await tour('oui');
  assert.equal(fait.interpretation.intent, 'CONFIRM');
  assert.equal(fait.transaction.status, 'completed');
  assert.ok(appelle(fait, 'POST', `transactions/${recap.transaction.id}/confirm`));
  const op = banque.operations.get(recap.transaction.id);
  assert.notEqual(op.confirmeeAvec, op.creeeAvec, 'jamais confirmée dans le tour qui l\'a créée');
  assert.equal(banque.solde(), 85000 - 5050);
});

test('jamais de confirmation dans le tour qui prépare, même si la phrase dit « oui »', async () => {
  const { tour, banque } = monter();
  const r = await tour('Envoie 5 000 à Pierre, oui je confirme');
  assert.ok(!appelle(r, 'POST', /\/confirm$/));
  assert.notEqual(r.transaction.status, 'completed');
  assert.equal(banque.solde(), 85000);
});

test('correction avant confirmation : la même opération est corrigée à la banque, puis confirmée', async () => {
  const { tour, banque } = monter();
  const recap = await tour('Envoie 5 000 à Pierre');
  const corrige = await tour('Non, pas 5 000, 10 000');
  assert.equal(corrige.interpretation.intent, 'CORRECTION');
  assert.ok(appelle(corrige, 'POST', `transactions/${recap.transaction.id}/update`));
  assert.equal(corrige.transaction.id, recap.transaction.id);
  assert.equal(corrige.interpretation.parameters.total, 10150);
  assert.equal((await tour('oui')).interpretation.intent, 'CONFIRM');
  assert.equal(banque.solde(), 85000 - 10150);
});

test('demande ambiguë : une question, aucune opération créée ; homonymes proposés plutôt que choisis', async () => {
  const { tour } = monter();
  const r = await tour('Envoie 5 000');
  assert.equal(r.interpretation.intent, 'CLARIFICATION_NEEDED');
  assert.ok(!appelle(r, 'POST', 'transactions'));
  assert.equal(r.transaction.status, 'none');
  const homonymes = await tour('Envoie 2 000 à Paul', { telephone: '237690000001' });
  assert.equal(homonymes.interpretation.intent, 'CLARIFICATION_NEEDED');
  assert.match(homonymes.response.text, /Paul Mbarga[\s\S]*Paul Essomba/);
});

test('solde insuffisant : l\'opération est demandée à la banque, son refus est expliqué, sans code', async () => {
  const { tour } = monter();
  const r = await tour('Envoie 100 000 à Marie');
  assert.equal(r.interpretation.intent, 'TRANSFER');
  assert.ok(appelle(r, 'POST', 'transactions'));
  assert.equal(r.transaction.status, 'none');
  assert.match(r.response.text, /85 000 FCFA[\s\S]*100 400 FCFA/);
});

test('changement de langue : le choix de la personne vaut tant que la passerelle ne change pas de langue ; l\'opération est gardée', async () => {
  const { tour } = monter();
  const recap = await tour('Envoie 2 000 à Pierre', { langue: 'bum' });
  assert.equal(recap.interpretation.language, 'bum');
  const fr = await tour('Parle-moi en français', { langue: 'bum' });
  assert.equal(fr.interpretation.intent, 'LANGUAGE_SWITCH');
  assert.equal(fr.interpretation.language, 'fr');
  assert.equal(fr.transaction.status, 'pending');
  const fait = await tour('oui', { langue: 'bum' });
  assert.equal(fait.interpretation.language, 'fr');
  assert.equal(fait.interpretation.intent, 'CONFIRM');
});

test('parcours multicanal : commencé dans l\'application, retrouvé à l\'appel USSD, confirmé sur l\'USSD avec le même numéro', async () => {
  const { tour, banque } = monter();
  const recap = await tour('Envoie 5 000 à Pierre', { canal: 'mobile' });
  const appel = await tour('', { canal: 'ussd' });
  assert.equal(appel.transaction.status, 'pending');
  assert.match(appel.response.text, /5 000 FCFA/, 'l\'opération en attente revient à l\'écran');
  const fait = await tour('1', { canal: 'ussd' });
  assert.equal(fait.interpretation.intent, 'CONFIRM');
  assert.equal(banque.operations.get(recap.transaction.id).status, 'completed');
});

test('USSD : le menu à l\'appel, une touche du menu devient la demande', async () => {
  const { tour } = monter();
  const accueil = await tour('', { canal: 'ussd', telephone: '237690000001' });
  assert.match(accueil.response.text, /Awa[\s\S]*\n1\. /);
  const solde = await tour('1', { canal: 'ussd' });
  assert.equal(solde.interpretation.intent, 'BALANCE_INQUIRY');
  assert.match(solde.response.text, /85 000 FCFA/);
});

test('frais et historique : la banque du service est interrogée, avec sa grille', async () => {
  const { tour } = monter();
  const frais = await tour('Quels sont les frais pour envoyer 25 001 ?');
  assert.equal(frais.interpretation.intent, 'FEE_INQUIRY');
  assert.ok(appelle(frais, 'GET', 'fees'));
  assert.match(frais.response.text, /400 FCFA[\s\S]*25 401 FCFA/);
  const historique = await tour('Mes dernières opérations');
  assert.equal(historique.interpretation.intent, 'TRANSACTION_HISTORY');
  assert.ok(appelle(historique, 'GET', /^accounts\/690000001\/transactions/));
  assert.match(historique.response.text, /15 000 FCFA/);
});

test('terminologie : l\'explication validée du terme, dans la langue', async () => {
  const { tour, ctx } = monter();
  const r = await tour('C\'est quoi les frais ?', { langue: 'bum' });
  assert.equal(r.interpretation.intent, 'TERM_EXPLANATION');
  assert.equal(r.response.text, ctx.reponses.rendre({ ref: 'E02' }, 'bum', 'web').texte);
});

test('une opération abandonnée est annulée à la banque : rien ne reste en attente', async () => {
  const { tour, banque } = monter();
  const recap = await tour('Envoie 5 000 à Pierre');
  const solde = await tour('Quel est mon solde ?');
  assert.equal(solde.interpretation.intent, 'BALANCE_INQUIRY');
  assert.ok(appelle(solde, 'POST', `transactions/${recap.transaction.id}/cancel`));
  assert.equal(banque.operations.get(recap.transaction.id).status, 'cancelled');
  const autre = await tour('Envoie 5 000 à Pierre');
  const non = await tour('non');
  assert.equal(non.interpretation.intent, 'CANCEL');
  assert.equal(banque.operations.get(autre.transaction.id).status, 'cancelled');
});

test('langue d\'une demande : les mots propres à une seule langue ; dans le doute, aucun avis', async () => {
  const { langueProbable } = await import('../core/langue-probable.ts');
  const v = new Map([['fr', new Set(['envoie', 'argent', 'operation', 'oui'])], ['qaa', new Set(['zorba', 'kelim', 'operation'])]]);
  assert.equal(langueProbable('Envoie de l\'argent', v), 'fr');
  assert.equal(langueProbable('zorba kelim 5 000', v), 'qaa');
  assert.equal(langueProbable('opération', v), null, 'un mot commun aux deux langues ne dit rien');
  assert.equal(langueProbable('zorba oui', v), null, 'autant d\'un côté que de l\'autre');
  assert.equal(langueProbable('oui', v, { minimum: 2, sansAutre: true }), null, 'en cours de conversation, un mot isolé ne suffit pas');
  assert.equal(langueProbable('Envoie à Zorba', v, { ignorer: new Set(['zorba']) }), 'fr', 'un nom de contact n\'a pas de langue');
});

test('sans langue donnée par la passerelle : reconnue aux mots de la demande, gardée malgré un « oui » glissé', async () => {
  const { tour } = monter();
  const bulu = await tour('mebal môé', { langue: null });
  assert.equal(bulu.interpretation.language, 'bum');
  assert.doesNotMatch(bulu.response.text, /Votre solde/);
  const recap = await tour('lôm pierre 5 000', { langue: null });
  assert.equal(recap.interpretation.language, 'bum');
  const fait = await tour('oui', { langue: null });
  assert.equal(fait.interpretation.intent, 'CONFIRM');
  assert.equal(fait.interpretation.language, 'bum', 'un « oui » en français ne change pas la langue de la conversation');
  const autre = monter();
  const fr = await autre.tour('Quel est mon solde ?', { langue: null });
  assert.equal(fr.interpretation.language, 'fr');
  assert.match(fr.response.text, /Votre solde est de 85 000 FCFA/);
});

test('USSD sans langue donnée, numéro jamais vu : l\'écran de choix, puis le menu dans la langue choisie', async () => {
  const { tour } = monter();
  const choix = await tour('', { canal: 'ussd', langue: null, telephone: '237690000001' });
  assert.equal(choix.interpretation.intent, 'CLARIFICATION_NEEDED');
  assert.match(choix.response.text, /\n1\. Français\n2\. Bulu$/);
  const menu = await tour('2', { canal: 'ussd', langue: null });
  assert.equal(menu.interpretation.intent, 'LANGUAGE_SWITCH');
  assert.equal(menu.interpretation.language, 'bum');
  const solde = await tour('1', { canal: 'ussd', langue: null });
  assert.equal(solde.interpretation.intent, 'BALANCE_INQUIRY');
  assert.equal(solde.interpretation.language, 'bum');
});

test('comme en ligne : données embarquées sans nom de traducteur, conversation relue d\'un stockage à chaque tour', async () => {
  const { donneesEnLigne } = await import('../tools/deployer-passerelle.js');
  const { contexteDepuis } = await import('../service/contexte.ts');
  const { creerMiddleware } = await import('../service/middleware.ts');
  const donnees = JSON.parse(JSON.stringify(await donneesEnLigne('profiles/safinum.json')));
  assert.ok(donnees.contexte.pack.phrases.every((p) => !p.traduit_par || /^Mayem-\d+$/.test(p.traduit_par)), 'pack public : des codes, jamais des noms');
  const banque = banqueDistante({ cle: CLE });
  const base = profil.middleware.banque.base;
  // Comme l'objet durable : l'état n'existe qu'écrit, et relu tel quel au tour suivant
  const stockage = new Map();
  const etats = { lire: async (cle) => (stockage.has(cle) ? JSON.parse(stockage.get(cle)) : undefined), ecrire: async (cle, etat) => { stockage.set(cle, JSON.stringify(etat)); } };
  const tourDeCanal = creerMiddleware({
    ctx: contexteDepuis(donnees.contexte, null), profil: donnees.profil.middleware, cle: CLE, langueParDefaut: donnees.profil.langue,
    langues: donnees.langues, menu: donnees.profil.ussd.menu, preferences: { lire: async () => null, ecrire: async () => {} }, noter: () => {}, etats,
    appeler: async (url, init) => banque.traiter(new Request(String(url).replace(base, 'http://banque.test/api/v1'), init)),
  });
  let n = 0;
  const tour = async (texte) => {
    const corps = { trace_id: `en-ligne-${++n}`, channel: 'web', phone: '237690000001', language: 'fr', input: { text: texte }, constraints: CONTRAINTES.web };
    const r = await (await tourDeCanal(new Request('http://mayem.test/v1/middleware', { method: 'POST', body: JSON.stringify(corps) }))).json();
    conforme(r, CONTRAINTES.web);
    return r;
  };
  await tour('Envoie 5 000 à Pierre');
  assert.equal((await tour('Non, pas 5 000, 10 000')).interpretation.intent, 'CORRECTION');
  assert.equal((await tour('oui')).interpretation.intent, 'CONFIRM');
  assert.equal(banque.solde(), 85000 - 10150);
  assert.doesNotMatch([...stockage.keys(), ...stockage.values()].join(' '), /690000001/, 'le numéro de la personne n\'est jamais gardé en clair');
});

test('banque injoignable ou tour mal formé : toujours une réponse valide, rien d\'exécuté', async () => {
  const { tour } = monter({ appeler: async () => { throw new Error('connexion refusée'); } });
  const r = await tour('Quel est mon solde ?');
  assert.equal(r.transaction.status, 'none');
  assert.match(r.response.text, /Le service ne répond pas/);
  const { ctx } = monter();
  const passerelle = creerPasserelle({ ctx, pack, profil, appeler: async () => new Response('{}'), cleBanque: CLE });
  const mal = await (await passerelle.traiter(new Request('http://mayem.test/v1/middleware', { method: 'POST', body: 'pas du json' }))).json();
  conforme(mal, CONTRAINTES.web);
  assert.equal(mal.interpretation.intent, 'UNKNOWN');
});
