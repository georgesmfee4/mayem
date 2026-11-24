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
  const telephone = (id, numero = '+237690000001') => {
    const saisies = [];
    return async (saisie) => {
      if (saisie !== undefined) saisies.push(saisie);
      const corps = new URLSearchParams({ sessionId: id, serviceCode: '*123#', phoneNumber: numero, text: saisies.join('*') });
      return (await demander('/v1/ussd', { method: 'POST', body: corps })).text();
    };
  };
  return { passerelle, demander, telephone, appels, banque };
}

// Premier appel d'un numéro : l'écran de choix de la langue, puis le choix (2 : la langue nationale)
async function ouvrir(appel, choix = '2') {
  const ecran = await appel();
  assert.match(ecran, /^CON [\s\S]*\n1\. Français\n2\. Bulu$/);
  return appel(choix);
}

test('santé : profil, langue et modes branchés', async () => {
  const { demander } = monter();
  const sante = await (await demander('/sante')).json();
  assert.deepEqual({ ...sante, pack: undefined }, { service: 'Mayem', profil: 'Banque d\'essai', langue: 'bum', nom: 'Bulu', langues: [{ code: 'fr', nom: 'Français' }, { code: 'bum', nom: 'Bulu' }], pack: undefined, ussd: 'relais', api: true });
});

test('USSD relayé : premier écran traduit ligne à ligne, numéros de choix gardés', async () => {
  const { telephone } = monter();
  const ecran = await ouvrir(telephone('s1'));
  assert.match(ecran, /^CON /);
  assert.match(ecran, /\n1\. Yené mebal\n2\. E lôm moné\n/);
  assert.ok(ecran.length <= 4 + 182);
});

test('USSD relayé : les chiffres passent tels quels, le solde revient traduit, montant intact', async () => {
  const { telephone, appels } = monter();
  const appel = telephone('s2');
  await ouvrir(appel);
  const ecran = await appel('1');
  assert.equal(ecran, 'END Mebal môé: 85 000 FCFA');
  assert.match(appels.at(-1).corps, /text=1(&|$)/);
});

test('USSD relayé : une phrase devient le chemin de touches, puis code PIN masqué et transfert exécuté', async () => {
  const { telephone, appels, passerelle, banque } = monter();
  const appel = telephone('s3');
  await ouvrir(appel);
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
  await ouvrir(appel);
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
  await ouvrir(appel);
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
  const accueil = await ouvrir(appel);
  assert.match(accueil, /^CON .*Awa/);
  assert.match(accueil, /\n1\. Mebal\n/);
  const solde = await appel('1');
  assert.match(solde, /85 000 FCFA/);
});

test('navigation à la main, touche par touche : la même opération est reconnue, avec la même empreinte', async () => {
  const { telephone, passerelle } = monter();
  const appel = telephone('s7');
  await ouvrir(appel);
  for (const touche of ['2', '677123456', '5000']) await appel(touche);
  const aLaMain = passerelle.journal.at(-1);
  const autre = monter();
  const parPhrase = autre.telephone('s8');
  await ouvrir(parPhrase);
  await parPhrase('envoie 5000 au 677123456');
  assert.equal(aLaMain.statut, 'en_attente_confirmation');
  assert.equal(aLaMain.empreinte, autre.passerelle.journal.at(-1).empreinte);
});

test('interaction multicanale : le même transfert a la même empreinte par l\'USSD, l\'application mobile et l\'assistant', async () => {
  const { telephone, passerelle, demander } = monter();
  const appel = telephone('s9');
  await ouvrir(appel);
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

test('premier appel : l\'écran de choix de la langue, sans rien demander au service', async () => {
  const { telephone, appels } = monter();
  const ecran = await telephone('c1')();
  assert.match(ecran, /^CON Choisissez votre langue\.\nfiale nkôbo\n1\. Français\n2\. Bulu$/);
  assert.equal(appels.length, 0);
  const appel = telephone('c1b');
  await appel();
  assert.match(await appel('7'), /^CON Choisissez votre langue\.\nfiale nkôbo\n1\. Français\n2\. Bulu$/, 'un choix inconnu redemande la langue');
  assert.equal(appels.length, 0);
});

test('écrire le nom d\'une langue change de langue à tout moment ; le service ne reçoit rien', async () => {
  const { telephone, appels, passerelle } = monter();
  const appel = telephone('c2');
  const menu = await ouvrir(appel, '1');
  assert.equal(menu, 'CON Bienvenue\n1. Consulter le solde\n2. Envoyer de l\'argent\n3. Historique des transactions\n4. Acheter du crédit', 'aucune ligne ajoutée au menu du service');
  const avant = appels.length;
  const enBulu = await appel('Bulu');
  assert.equal(appels.length, avant, 'le service n\'a rien reçu');
  assert.doesNotMatch(enBulu, /Bienvenue|Consulter le solde/, 'le menu est réaffiché dans la langue écrite');
  assert.match(passerelle.journal.at(-1).validation, /le service n'a rien reçu/);
  const enFrancais = await appel('en français');
  assert.equal(appels.length, avant);
  assert.match(enFrancais, /\nBienvenue\n1\. Consulter le solde\n2\. Envoyer de l'argent\n3\. Historique des transactions\n4\. Acheter du crédit$/);
  assert.equal(await appel('1'), 'END Votre solde est de 85 000 FCFA');
  assert.match(appels.at(-1).corps, /text=1(&|$)/, 'le service reçoit la touche 1, comme sans Mayem');
});

test('changer de langue en cours de route reprend l\'écran quitté, au même endroit du parcours', async () => {
  const { telephone, appels } = monter();
  const appel = telephone('c3');
  await ouvrir(appel, '1');
  await appel('envoie 5000 au 678901234');
  const avant = appels.length;
  assert.match(await appel('bulu'), /wô zu lôm 5 000 FCFA asù Pierre Owona/);
  // « langue » seul rouvre le choix ; le numéro ou le nom de la langue y répond
  assert.match(await appel('langue'), /\n1\. Français\n2\. Bulu$/);
  assert.match(await appel('Français'), /Pierre Owona/);
  assert.equal(appels.length, avant, 'changer de langue ne dérange pas le service');
  assert.match(await appel('1'), /^CON /, 'le parcours continue : écran du code PIN');
  assert.match(appels.at(-1).corps, /text=2\*678901234\*5000\*1(&|$)/);
});

test('sans service à relayer : la langue s\'écrit aussi, et le menu quitté est repris', async () => {
  const { telephone } = monter(lire('../profiles/mayem-seul.json'));
  const appel = telephone('s1', '+237690000009');
  const menu = await ouvrir(appel, '1');
  assert.match(menu, /^CON Bonjour Awa\. Que voulez-vous faire \?\n1\. Solde\n/);
  assert.match(await appel('langue'), /\n1\. Français\n2\. Bulu$/);
  assert.doesNotMatch(await appel('2'), /Que voulez-vous faire|Français/, 'le menu revient, dans la langue choisie');
  assert.match(await appel('français'), /\nBonjour Awa\. Que voulez-vous faire \?\n1\. Solde\n/);
  assert.match(await appel('1'), /85 000 FCFA/, 'la touche 1 du menu repris donne le solde');
});

test('la touche 0 va toujours au service : Mayem ne la réserve plus', async () => {
  const { telephone, appels } = monter();
  const appel = telephone('c4');
  await ouvrir(appel, '1');
  await appel('0');
  assert.match(appels.at(-1).corps, /text=0(&|$)/);
});

test('preuve : le service reçoit les requêtes de l\'opérateur comme sans Mayem, et en français l\'écran est le sien à l\'octet près', async () => {
  const { demander, appels } = monter();
  const champs = (session, text) => new URLSearchParams({ sessionId: session, serviceCode: '*123#', phoneNumber: '+237690000001', networkCode: '62401', text });
  const operateur = async (session, saisies) => (await demander('/v1/ussd', { method: 'POST', body: champs(session, saisies.join('*')) })).text();
  const parcours = ['2', '678901234', '5000'];
  // Sans Mayem : l'opérateur appelle le service lui-même
  const direct = serviceBanque(banqueSimulee(lire('../service/banque-essai.json')));
  const sansMayem = [];
  for (let i = 0; i <= parcours.length; i++) {
    const reponse = await direct.traiter(new Request('http://127.0.0.1:8788/ussd', { method: 'POST', body: champs('p1', parcours.slice(0, i).join('*')) }));
    sansMayem.push((await reponse.text()).trim());
  }
  const attendues = (session) => parcours.map((_, i) => champs(session, parcours.slice(0, i).join('*')).toString()).concat(champs(session, parcours.join('*')).toString());
  // Avec Mayem, en français : premier appel (écran de choix de Mayem, le service n'est pas appelé), puis les mêmes touches
  await operateur('p1', []);
  assert.equal(appels.length, 0);
  const tapees = ['1'];
  const avecMayem = [await operateur('p1', tapees)];
  for (const touche of parcours) { tapees.push(touche); avecMayem.push(await operateur('p1', tapees)); }
  assert.deepEqual(avecMayem, sansMayem, 'chaque écran est celui du service, sans une ligne de plus');
  assert.deepEqual(appels.map((a) => a.corps), attendues('p1'), 'numéro, session, code et champs en plus arrivent tels que l\'opérateur les a envoyés');
  // Même parcours en écrivant une langue au milieu : ni une requête de plus, ni une de moins
  appels.length = 0;
  const saisies = ['2', 'bulu', '678901234', 'français', '5000'];
  for (let i = 0; i <= saisies.length; i++) await operateur('p2', saisies.slice(0, i));
  assert.deepEqual(appels.map((a) => a.corps), attendues('p2'));
});

test('la langue choisie est gardée pour ce numéro : retrouvée au prochain appel, dans l\'application et par l\'assistant', async () => {
  const { telephone, demander, appels } = monter();
  await ouvrir(telephone('c5'), '1');
  const rappel = await telephone('c6')();
  assert.match(rappel, /^CON Bienvenue\n/, 'le numéro connu arrive directement sur le menu, dans sa langue');
  assert.equal(appels.length, 2);
  const api = await (await demander('/v1/relais/api/solde', { headers: { 'x-client-telephone': '690000001' } })).json();
  assert.equal(api.message, 'Votre solde est de 85 000 FCFA');
  const autreClient = await (await demander('/v1/relais/api/solde', { headers: { 'x-client-telephone': '699999999' } })).json();
  assert.equal(autreClient.message, 'Mebal môé: 85 000 FCFA', 'un autre client garde la langue par défaut du profil');
  const assistant = await (await demander('/v1/converser', { method: 'POST', body: JSON.stringify({ texte: 'Quel est mon solde ?', telephone: '+237 690 00 00 01' }) })).json();
  assert.equal(assistant.langue, 'fr');
  assert.match(assistant.reponse, /^Votre solde est de/);
});

test('préférences : seule la langue est gardée, rattachée à l\'empreinte du numéro, jamais au numéro en clair', async () => {
  const { empreinteNumero, preferencesEnMemoire } = await import('../service/preferences.ts');
  const p = preferencesEnMemoire();
  await p.ecrire('+237 677 12 34 56', 'bum');
  assert.equal(await p.lire('677123456'), 'bum');
  assert.equal(await p.lire('699999999'), null);
  assert.match(await empreinteNumero('677123456'), /^[0-9a-f]{64}$/);
  assert.equal(await empreinteNumero('+237677123456'), await empreinteNumero('677 12 34 56'));
});

test('écran de choix : le numéro ou le nom de la langue, sans souci de casse ni d\'accents', async () => {
  const { langueChoisie } = await import('../service/choix-langue.ts');
  const langues = [{ code: 'fr', nom: 'Français' }, { code: 'bum', nom: 'Bulu' }];
  assert.equal(langueChoisie('2', langues), 'bum');
  for (const saisie of ['bulu', 'BULU', ' Bulu ', 'en bulu']) assert.equal(langueChoisie(saisie, langues), 'bum', saisie);
  for (const saisie of ['francais', 'Français', 'en français']) assert.equal(langueChoisie(saisie, langues), 'fr', saisie);
  for (const saisie of ['3', 'bul', 'anglais', '']) assert.equal(langueChoisie(saisie, langues), null, saisie);
});

test('relais : la phrase passe par le noyau ; un contact du carnet, même donné après coup, complète l\'opération', async () => {
  const { telephone, appels } = monter();
  const appel = telephone('q1');
  await ouvrir(appel, '2');
  assert.match(await appel('lôm jean 10 000'), /Jean Bekono/);
  assert.match(appels.at(-1).corps, /text=2\*691234567\*10000(&|$)/);
  const autre = telephone('q2', '+237690000002');
  await ouvrir(autre, '2');
  const avant = appels.length;
  assert.equal(await autre('lôm 10 000'), 'CON Zà wô lôm 10 000 FCFA ?');
  assert.equal(appels.length, avant, 'une question de Mayem ne dérange pas le service');
  await autre('jean');
  assert.match(appels.at(-1).corps, /text=2\*691234567\*10000(&|$)/);
});

test('relais : homonymes, contact inconnu, numéro faux ; chaque fois une question précise et validée', async () => {
  const { telephone, appels, passerelle } = monter();
  const appel = telephone('q3');
  await ouvrir(appel, '2');
  assert.match(await appel('lôm Paul 2000'), /\n1\. Paul Mbarga, 677 12 34 56\n2\. Paul Essomba, 699 11 22 33$/);
  assert.ok(passerelle.journal.at(-1).reponses.filter((x) => x.ref !== 'faits').every((x) => x.traduit));
  await appel('Essomba');
  assert.match(appels.at(-1).corps, /text=2\*699112233\*2000(&|$)/);
  const autre = telephone('q4', '+237690000003');
  await ouvrir(autre, '2');
  await autre('lôm Zorro 5000');
  for (const [saisie, ref] of [['Zorro', 'RF057'], ['12345', 'RF063']]) {
    await autre(saisie);
    assert.deepEqual(passerelle.journal.at(-1).reponses.map((x) => [x.ref, x.traduit]), [[ref, true]], saisie);
  }
  await autre('677123456');
  assert.match(appels.at(-1).corps, /text=2\*677123456\*5000(&|$)/);
});

test('relais : personne ne reste bloqué', async () => {
  const { telephone, appels, passerelle } = monter();
  // Une touche de menu pendant une question de Mayem revient au service
  const a = telephone('q5');
  await ouvrir(a, '1');
  await a('envoie à Pierre');
  assert.match(await a('3'), /^END Historique des transactions/);
  assert.match(appels.at(-1).corps, /text=3(&|$)/);
  // Trois réponses sans suite : rien n'est fait, Mayem le dit, et les touches vont de nouveau au service
  const b = telephone('q6', '+237690000004');
  await ouvrir(b, '1');
  await b('envoie à Pierre');
  await b('beaucoup');
  await b('rien');
  const avant = appels.length;
  await b('toto');
  assert.equal(passerelle.journal.at(-1).statut, 'annulee');
  assert.equal(appels.length, avant);
  assert.equal(await b('1'), 'END Votre solde est de 85 000 FCFA');
  // « annuler » pendant une question, et l'écran de choix ouvert en cours de route qu'une phrase referme
  const c = telephone('q7', '+237690000005');
  await ouvrir(c, '1');
  await c('envoie à Pierre');
  assert.match(await c('annuler'), /^CON Opération annulée\. Aucun montant n'a été débité\.\nBienvenue/);
  await c('langue');
  assert.equal(await c('solde'), 'END Votre solde est de 85 000 FCFA');
});

test('relais : la négation n\'envoie rien ; « oui » et « non » répondent à l\'écran du service ; le crédit va à l\'appelant', async () => {
  const { telephone, appels } = monter();
  const a = telephone('q9');
  await ouvrir(a, '1');
  const avant = appels.length;
  assert.match(await a('n\'envoie pas 5000 à Pierre'), /^CON D'accord, je ne fais rien\./);
  assert.equal(appels.length, avant, 'une demande négative n\'envoie rien au service');
  await a('envoie 5000 à Pierre');
  assert.match(await a('oui'), /^CON Saisissez votre code PIN/);
  assert.match(appels.at(-1).corps, /text=2\*678901234\*5000\*1(&|$)/);
  const b = telephone('q10', '+237690000007');
  await ouvrir(b, '1');
  await b('envoie 5000 à Pierre');
  await b('non');
  assert.match(appels.at(-1).corps, /text=2\*678901234\*5000\*2(&|$)/);
  const c = telephone('q11', '+237670000008');
  await ouvrir(c, '1');
  await c('achète 1000 de crédit');
  assert.match(appels.at(-1).corps, /text=4\*670000008\*1000(&|$)/);
});

test('relais : un service muet ou en erreur ne laisse rien en suspens ; message validé, session terminée', async () => {
  const ctx = chargerContexte('bum', banqueSimulee(lire('../service/banque-essai.json')));
  const attendu = ctx.reponses.rendre({ ref: 'RF064' }, 'bum', 'ussd');
  assert.ok(attendu.traduit);
  for (const appeler of [async () => { throw new Error('connexion refusée'); }, async () => new Response('erreur', { status: 500 })]) {
    const passerelle = creerPasserelle({ ctx, pack, profil: lire('../profiles/banque-essai.json'), appeler, pages: {} });
    const corps = (text) => new URLSearchParams({ sessionId: 'panne', serviceCode: '*123#', phoneNumber: '+237690000001', text });
    await passerelle.traiter(new Request('http://mayem.test/v1/ussd', { method: 'POST', body: corps('') }));
    const ecran = await (await passerelle.traiter(new Request('http://mayem.test/v1/ussd', { method: 'POST', body: corps('2') }))).text();
    assert.equal(ecran, `END ${attendu.texte}`);
    assert.equal(passerelle.journal.at(-1).statut, 'erreur');
    assert.match(passerelle.journal.at(-1).validation, /rien exécuté/);
  }
});
