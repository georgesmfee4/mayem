// Passerelle : branchée sur la banque d'essai (fixtures/services/banque.js) sans réseau. L'USSD du service est relayé
// et traduit, une phrase devient le chemin de touches, le code PIN n'est jamais journalisé, l'API mobile est traduite
// sans toucher aux valeurs, et la même opération garde la même empreinte d'un canal à l'autre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { banqueSimulee } from '../service/banque.ts';
import { creerPasserelle } from '../service/passerelle.ts';
import { PIN_ESSAI, serviceBanque } from '../fixtures/services/banque.js';
import { chargerContexte } from '../tools/conversation.js';

const lire = (chemin) => JSON.parse(readFileSync(new URL(chemin, import.meta.url), 'utf8'));
const pack = lire('../packs/bum/pack.json');

function monter(profil = lire('../profiles/banque-essai.json')) {
  const banque = banqueSimulee(lire('../service/banque-essai.json'));
  const service = serviceBanque(banque);
  const appels = [];
  const appeler = async (url, init) => { appels.push({ url, corps: String(init.body || '') }); return service.traiter(new Request(url, init)); };
  const passerelle = creerPasserelle({ ctx: chargerContexte('bum', banque), pack, profil, appeler, pages: { tableau: '<h1>tableau</h1>' } });
  const demander = (chemin, init) => passerelle.traiter(new Request(`http://mayem.test${chemin}`, init));
  // Une session USSD : chaque appel envoie tout ce qui a été tapé depuis le début, comme le fait l'opérateur
  const telephone = (id) => {
    const saisies = [];
    return async (saisie) => {
      if (saisie !== undefined) saisies.push(saisie);
      const corps = new URLSearchParams({ sessionId: id, serviceCode: '*123#', phoneNumber: '+237690000001', text: saisies.join('*') });
      return (await demander('/v1/ussd', { method: 'POST', body: corps })).text();
    };
  };
  return { passerelle, demander, telephone, appels, banque };
}

test('santé : profil, langue et modes branchés', async () => {
  const { demander } = monter();
  const sante = await (await demander('/sante')).json();
  assert.deepEqual({ ...sante, pack: undefined }, { service: 'Mayem', profil: 'Banque d\'essai', langue: 'bum', nom: 'Bulu', pack: undefined, ussd: 'relais', api: true });
});

test('USSD relayé : premier écran traduit ligne à ligne, numéros de choix gardés', async () => {
  const { telephone } = monter();
  const ecran = await telephone('s1')();
  assert.match(ecran, /^CON /);
  assert.match(ecran, /\n1\. Yené mebal\n2\. E lôm moné\n/);
  assert.ok(ecran.length <= 4 + 182);
});

test('USSD relayé : les chiffres passent tels quels, le solde revient traduit, montant intact', async () => {
  const { telephone, appels } = monter();
  const appel = telephone('s2');
  await appel();
  const ecran = await appel('1');
  assert.equal(ecran, 'END Mebal môé: 85 000 FCFA');
  assert.match(appels.at(-1).corps, /text=1(&|$)/);
});

test('USSD relayé : une phrase devient le chemin de touches, puis code PIN masqué et transfert exécuté', async () => {
  const { telephone, appels, passerelle, banque } = monter();
  const appel = telephone('s3');
  await appel();
  const recap = await appel('envoie 5000 au 677 12 34 56');
  assert.match(appels.at(-1).corps, /text=2\*677123456\*5000/);
  assert.match(recap, /^CON /);
  assert.match(recap, /5 000 FCFA/);
  const pin = await appel('1');
  assert.match(pin, /^CON /);
  const fin = await appel(PIN_ESSAI);
  assert.match(fin, /^END /);
  assert.match(fin, /SIM-2026-000001/);
  assert.equal(await banque.solde(), 85000 - 5100);
  const tourDuPin = passerelle.journal.at(-1);
  assert.equal(tourDuPin.requete, '****', 'le code PIN ne figure jamais au journal');
  assert.match(tourDuPin.parametres.chemin, /\*\*\*\*$/);
  for (const ligne of passerelle.journal) {
    assert.notEqual(ligne.requete, PIN_ESSAI);
    assert.doesNotMatch(String(ligne.parametres.chemin || ''), new RegExp(`(^|\\*)${PIN_ESSAI}($|\\*)`));
  }
  const raccourci = passerelle.journal.find((l) => l.parametres.chemin === '2*677123456*5000');
  assert.equal(raccourci.intention, 'transfert');
  assert.equal(raccourci.statut, 'en_attente_confirmation');
  assert.match(raccourci.empreinte, /^op-/);
  assert.equal(tourDuPin.statut, 'executee', 'l\'écran « Opération réussie » marque l\'opération exécutée');
  assert.equal(tourDuPin.empreinte, raccourci.empreinte, 'l\'opération exécutée est celle du récapitulatif');
});

test('USSD relayé : une valeur manque, Mayem la demande avant d\'appeler le service', async () => {
  const { telephone, appels } = monter();
  const appel = telephone('s4');
  await appel();
  const avant = appels.length;
  const question = await appel('je veux envoyer de l\'argent au 677123456');
  assert.match(question, /^CON /);
  assert.equal(appels.length, avant, 'rien n\'est envoyé au service tant qu\'il manque le montant');
  const recap = await appel('3000');
  assert.match(appels.at(-1).corps, /text=2\*677123456\*3000/);
  assert.match(recap, /3 000 FCFA/);
});

test('la même opération a la même empreinte par l\'USSD relayé et par l\'assistant', async () => {
  const { telephone, passerelle, demander } = monter();
  const appel = telephone('s5');
  await appel();
  await appel('envoie 5000 au 678901234');
  const parUssd = passerelle.journal.at(-1).empreinte;
  const reponse = await (await demander('/v1/converser', { method: 'POST', body: JSON.stringify({ texte: 'Envoie 5 000 à Pierre', canal: 'mobile' }) })).json();
  assert.equal(reponse.journal.empreinte, parUssd);
});

test('API mobile relayée : messages traduits, valeurs et références intactes, langue au choix', async () => {
  const { demander } = monter();
  const traduit = await (await demander('/v1/relais/api/solde')).json();
  assert.deepEqual(traduit, { titre: 'Mebal môé', message: 'Mebal môé: 85 000 FCFA', solde: 85000, devise: 'FCFA' });
  const francais = await (await demander('/v1/relais/api/solde', { headers: { 'x-mayem-langue': 'fr' } })).json();
  assert.equal(francais.message, 'Votre solde est de 85 000 FCFA');
  const recap = await demander('/v1/relais/api/transfert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ telephone: '678901234', montant: 5000 }) });
  const corps = await recap.json();
  assert.match(recap.headers.get('x-mayem'), /traduits=\d+/);
  assert.ok(corps.message.includes('5 000 FCFA') && corps.message.includes('Pierre Owona'));
  const fin = await (await demander('/v1/relais/api/transfert/confirmer', { method: 'POST', body: JSON.stringify({ telephone: '678901234', montant: 5000, pin: PIN_ESSAI }) })).json();
  assert.match(fin.reference, /^SIM-2026-\d{6}$/);
});

test('API relayée : une erreur du service garde son code et son message est traduit s\'il est validé', async () => {
  const { demander } = monter();
  const r = await demander('/v1/relais/api/transfert/confirmer', { method: 'POST', body: JSON.stringify({ telephone: '678901234', montant: 90000, pin: PIN_ESSAI }) });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { erreur: 'Mebal teké yiane' });
});

test('converser et traduire : demandes valides, refus clairs des demandes mal formées', async () => {
  const { demander } = monter();
  const ok = await (await demander('/v1/converser', { method: 'POST', body: JSON.stringify({ texte: 'Quel est mon solde ?' }) })).json();
  assert.equal(ok.langue, 'bum');
  assert.match(ok.reponse, /85 000 FCFA/);
  assert.ok(ok.session);
  const textes = await (await demander('/v1/traduire', { method: 'POST', body: JSON.stringify({ textes: ['Solde', 'Texte jamais validé'] }) })).json();
  assert.deepEqual(textes.textes, ['Mebal', 'Texte jamais validé']);
  assert.equal((await demander('/v1/converser', { method: 'POST', body: '{pas du json' })).status, 400);
  assert.equal((await demander('/v1/converser', { method: 'POST', body: JSON.stringify({ texte: '' }) })).status, 400);
  assert.equal((await demander('/v1/converser', { method: 'POST', body: 'x'.repeat(70000) })).status, 413);
  assert.equal((await demander('/nulle-part')).status, 404);
});

test('journal : lignes numérotées, lues à partir d\'un numéro, et tableau de bord servi', async () => {
  const { demander } = monter();
  await demander('/v1/converser', { method: 'POST', body: JSON.stringify({ texte: 'Bonjour' }) });
  await demander('/v1/converser', { method: 'POST', body: JSON.stringify({ texte: 'Merci, au revoir' }) });
  const tout = (await (await demander('/v1/journal')).json()).lignes;
  assert.deepEqual(tout.map((l) => l.numero), [1, 2]);
  assert.deepEqual((await (await demander('/v1/journal?depuis=1')).json()).lignes.map((l) => l.numero), [2]);
  assert.equal(await (await demander('/tableau')).text(), '<h1>tableau</h1>');
});

test('USSD sans service à relayer : Mayem répond lui-même, menu du profil compris', async () => {
  const { telephone } = monter(lire('../profiles/mayem-seul.json'));
  const appel = telephone('s6');
  const accueil = await appel();
  assert.match(accueil, /^CON .*Awa/);
  assert.match(accueil, /\n1\. Mebal\n/);
  const solde = await appel('1');
  assert.match(solde, /85 000 FCFA/);
});

test('navigation à la main, touche par touche : la même opération est reconnue, avec la même empreinte', async () => {
  const { telephone, passerelle } = monter();
  const appel = telephone('s7');
  for (const touche of [undefined, '2', '677123456', '5000']) await appel(touche);
  const aLaMain = passerelle.journal.at(-1);
  const autre = monter();
  const parPhrase = autre.telephone('s8');
  await parPhrase();
  await parPhrase('envoie 5000 au 677123456');
  assert.equal(aLaMain.statut, 'en_attente_confirmation');
  assert.equal(aLaMain.empreinte, autre.passerelle.journal.at(-1).empreinte);
});

test('interaction multicanale : le même transfert a la même empreinte par l\'USSD, l\'application mobile et l\'assistant', async () => {
  const { telephone, passerelle, demander } = monter();
  const appel = telephone('s9');
  await appel();
  await appel('envoie 5000 au 678901234');
  const parUssd = passerelle.journal.at(-1).empreinte;
  await demander('/v1/relais/api/transfert', { method: 'POST', body: JSON.stringify({ telephone: '678901234', montant: 5000 }) });
  const recapMobile = passerelle.journal.at(-1);
  assert.equal(recapMobile.statut, 'en_attente_confirmation');
  await demander('/v1/relais/api/transfert/confirmer', { method: 'POST', body: JSON.stringify({ telephone: '678901234', montant: 5000, pin: PIN_ESSAI }) });
  const execMobile = passerelle.journal.at(-1);
  assert.equal(execMobile.statut, 'executee');
  assert.ok(!JSON.stringify(execMobile).includes('"pin"'), 'le code PIN de la requête n\'est jamais lu ni journalisé');
  const web = await (await demander('/v1/converser', { method: 'POST', body: JSON.stringify({ texte: 'Envoie 5 000 à Pierre', canal: 'web' }) })).json();
  assert.equal(new Set([parUssd, recapMobile.empreinte, execMobile.empreinte, web.journal.empreinte]).size, 1);
});
