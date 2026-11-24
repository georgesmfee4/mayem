// Noyau conversationnel : les dix scénarios de la finale, la confirmation obligatoire, la négation, la cohérence
// entre canaux, les pannes et les réponses jamais mélangées entre deux langues. Banque simulée fictive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { banqueSimulee } from '../service/banque.ts';
import { nouvelleSession, traiter } from '../service/conversation.ts';
import { chargerContexte } from '../tools/conversation.js';
import { SCENARIOS, rejouer } from '../tools/scenarios.js';

const donnees = JSON.parse(readFileSync(new URL('../service/banque-essai.json', import.meta.url), 'utf8'));
const contexte = (banque = banqueSimulee(donnees)) => chargerContexte('bum', banque);

for (const scenario of SCENARIOS) {
  test(`scénario du jury : ${scenario.nom}`, async () => {
    const parCanal = await rejouer(scenario, 'bum');
    for (const tours of Object.values(parCanal)) {
      for (const { etape, tour } of tours) {
        const j = tour.journal;
        if (etape.intention) assert.equal(j.intention, etape.intention, etape.dire);
        assert.equal(j.statut, etape.statut, etape.dire);
        assert.deepEqual(j.reponses.map((x) => x.ref), etape.refs, etape.dire);
        for (const [cle, valeur] of Object.entries(etape.parametres || {})) assert.deepEqual(j.parametres[cle], valeur, `${etape.dire} : ${cle}`);
        if (etape.langue) assert.equal(j.langue, etape.langue === 'nationale' ? 'bum' : etape.langue, etape.dire);
        assert.equal(j.equipe, 'Mayem');
        assert.ok(j.temps_ms >= 0 && j.erreurs.length === 0, etape.dire);
      }
    }
  });
}

test('interaction multicanale : la même demande donne la même opération et la même empreinte sur chaque canal', async () => {
  const scenario = SCENARIOS.find((s) => s.canaux);
  const parCanal = await rejouer(scenario, 'bum');
  const empreintes = Object.values(parCanal).map((tours) => tours[0].tour.journal.empreinte);
  assert.equal(empreintes.length, 3);
  assert.match(empreintes[0], /^op-[0-9a-f]{16}$/);
  assert.equal(new Set(empreintes).size, 1);
});

test('rien n\'est exécuté sans un « oui » donné juste après un récapitulatif', async () => {
  for (const scenario of SCENARIOS) {
    for (const tours of Object.values(await rejouer(scenario, 'bum'))) {
      tours.forEach(({ etape, tour }, i) => {
        if (tour.journal.statut !== 'executee') return;
        const avant = tours[i - 1]?.tour.journal;
        assert.ok(avant && avant.reponses.some((x) => x.ref === 'RF033'), `${scenario.nom} : ${etape.dire}`);
        assert.ok(tour.journal.intention === 'oui' || tour.journal.intention === 'choix 1', `${scenario.nom} : ${etape.dire}`);
        assert.equal(tour.journal.empreinte, avant.empreinte, 'l\'opération exécutée est celle qui a été confirmée');
      });
    }
  }
});

test('une demande négative n\'exécute rien et le dit', async () => {
  const ctx = contexte();
  const s = nouvelleSession('n', 'web', 'fr');
  const tour = await traiter(ctx, s, 'N\'envoie pas l\'argent à Paul');
  assert.equal(tour.journal.statut, 'annulee');
  assert.deepEqual(tour.journal.reponses.map((x) => x.ref), ['RF067']);
  assert.equal(await ctx.banque.solde(), donnees.solde);
});

test('« non » au récapitulatif annule ; un nouveau « oui » ensuite n\'exécute rien', async () => {
  const ctx = contexte();
  const s = nouvelleSession('n', 'web', 'fr');
  await traiter(ctx, s, 'Envoie 5 000 à Pierre');
  assert.equal((await traiter(ctx, s, 'non')).journal.statut, 'annulee');
  const apres = await traiter(ctx, s, 'oui');
  assert.equal(apres.journal.statut, 'information');
  assert.deepEqual(apres.journal.reponses.map((x) => x.ref), ['RF068']);
  assert.equal(await ctx.banque.solde(), donnees.solde);
});

test('crédit et facture : récapitulatif, confirmation, exécution et solde mis à jour', async () => {
  const ctx = contexte();
  const s = nouvelleSession('c', 'ussd', 'fr');
  assert.deepEqual((await traiter(ctx, s, 'Mets-moi 1 000 de crédit')).journal.parametres.telephone, donnees.client.telephone);
  assert.equal((await traiter(ctx, s, '1')).journal.statut, 'executee');
  const menu = await traiter(ctx, s, 'Je veux payer une facture');
  assert.deepEqual(menu.journal.reponses.map((x) => x.ref), ['RF090', 'U14', 'U15']);
  assert.match(menu.texte, /^1\. /m);
  const recap = await traiter(ctx, s, '2');
  assert.deepEqual(recap.journal.parametres, { facture: '77310', type: 'eau', montant: 6800, total: 6800 });
  assert.equal((await traiter(ctx, s, 'oui')).journal.statut, 'executee');
  assert.equal(await ctx.banque.solde(), donnees.solde - 1000 - 6800);
  assert.equal((await traiter(ctx, s, 'Paie la facture 77310')).journal.validation, 'facture déjà payée');
});

test('dépenses de la période, et argent reçu d\'un proche', async () => {
  const ctx = contexte();
  const s = nouvelleSession('h', 'web', 'fr');
  const depenses = await traiter(ctx, s, 'Combien j\'ai dépensé cette semaine ?');
  assert.deepEqual(depenses.journal.parametres, { periode: 'semaine', total: 5000 + 1000 + 9850 + 20000 });
  const recu = await traiter(ctx, s, 'Est-ce que l\'argent de mon frère est arrivé ?');
  assert.deepEqual(recu.journal.reponses.map((x) => x.ref), ['RF026']);
  assert.match(recu.texte, /15 000 FCFA/);
});

test('une panne de la banque n\'exécute rien, le dit, et ne laisse aucune opération en suspens', async () => {
  const banque = banqueSimulee(donnees);
  const ctx = contexte({ ...banque, transferer: async () => { throw new Error('banque injoignable'); } });
  const s = nouvelleSession('p', 'web', 'fr');
  await traiter(ctx, s, 'Envoie 5 000 à Pierre');
  const tour = await traiter(ctx, s, 'oui');
  assert.equal(tour.journal.statut, 'erreur');
  assert.deepEqual(tour.journal.erreurs, ['banque injoignable']);
  assert.deepEqual(tour.journal.reponses.map((x) => x.ref), ['RF064']);
  assert.equal(s.brouillon, null);
});

test('en langue nationale, une réponse n\'est jamais un mélange : traduite et validée en entier, ou en français', async () => {
  const ctx = contexte();
  const s = nouvelleSession('l', 'web', 'bum');
  const solde = await traiter(ctx, s, 'Quel est mon solde ?');
  assert.equal(solde.journal.reponses[0].traduit, true, 'phrase validée du corpus : traduite');
  assert.doesNotMatch(solde.texte, /Votre solde/);
  const recap = await traiter(ctx, s, 'Envoie 2 000 à maman');
  assert.equal(recap.journal.reponses[0].traduit, true, 'récapitulatif pas encore validé : ses valeurs ligne à ligne, chaque ligne validée');
  assert.doesNotMatch(recap.texte, /Vous allez|Frais|Total|Numéro/);
  for (const valeur of ['2 000 FCFA', 'Marthe Ndzana', '655 00 11 22', '100 FCFA', '2 100 FCFA']) assert.ok(recap.texte.includes(valeur), valeur);
  const { creerReponses } = await import('../service/reponses.ts');
  const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
  const valeurs = { amount: '85 000 FCFA' };
  const reponses = creerReponses([{ ref: 'R1', fr: 'Phrase sans traduction : {amount}' }, { ref: 'L1', fr: 'Total à débiter : {amount}' },
    { ref: 'L2', fr: 'Ligne sans traduction : {amount}' }], [], pack);
  const lignes = (...refs) => refs.map((ref) => ({ ref, valeurs }));
  assert.equal(reponses.rendre({ ref: 'R1', valeurs, repli: lignes('L1') }, 'bum', 'web').traduit, true);
  assert.deepEqual(reponses.rendre({ ref: 'R1', valeurs, repli: lignes('L1', 'L2') }, 'bum', 'web'),
    { ref: 'R1', texte: 'Phrase sans traduction : 85 000 FCFA', langue: 'fr', traduit: false }, 'une ligne sans traduction : tout reste en français');
});

test('un numéro hors du carnet ne prend jamais la place d\'un nom : questions et récapitulatif validés, sans redite en français', async () => {
  const ctx = contexte();
  const s = nouvelleSession('hc', 'web', 'bum');
  const question = (await traiter(ctx, s, 'ma lôm 655 12 44 55 moné')).journal;
  assert.deepEqual(question.reponses.map((x) => [x.ref, x.traduit]), [['RF030', true]]);
  const recap = await traiter(ctx, s, '100');
  assert.deepEqual(recap.journal.reponses.map((x) => [x.ref, x.traduit]), [['RF037', true], ['RF033', true]]);
  for (const valeur of ['100 FCFA', '655 12 44 55', '200 FCFA']) assert.ok(recap.texte.includes(valeur), valeur);
  const fait = (await traiter(ctx, s, 'oui')).journal;
  assert.equal(fait.statut, 'executee');
  assert.deepEqual(fait.reponses.map((x) => [x.ref, x.traduit]), [['RF038', true], ['RF035', true]]);
  const fr = await traiter(contexte(), nouvelleSession('hf', 'web', 'fr'), 'envoie 100 au 655124455');
  assert.match(fr.texte, /^Vous allez envoyer 100 FCFA au 655 12 44 55\. Frais : 100 FCFA\. Total qui sera retiré de votre compte : 200 FCFA\./);
  const { creerReponses } = await import('../service/reponses.ts');
  const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
  const reponses = creerReponses([{ ref: 'N1', fr: 'Vous allez envoyer {amount} à {name}' }], [], pack);
  assert.equal(reponses.rendre({ ref: 'N1', valeurs: { amount: '100 FCFA', name: 'Jean Bekono' } }, 'bum', 'web').traduit, true);
  assert.equal(reponses.rendre({ ref: 'N1', valeurs: { amount: '100 FCFA', name: '655 12 44 55' } }, 'bum', 'web').traduit, false, 'un numéro n\'entre pas dans une case de nom');
});

test('le modèle validé d\'une réponse est rempli directement : un numéro de facture sans forme de référence ne la laisse pas en français', async () => {
  const ctx = contexte();
  const s = nouvelleSession('fa', 'web', 'bum');
  await traiter(ctx, s, 'payer facture');
  const recap = await traiter(ctx, s, '1');
  assert.deepEqual(recap.journal.reponses.map((x) => [x.ref, x.traduit]), [['RF092', true], ['RF033', true]]);
  assert.ok(recap.texte.includes('458221') && recap.texte.includes('12 450 FCFA'));
});

test('le journal ne garde que des faits de l\'opération : ni code PIN ni nom de traducteur', async () => {
  const ctx = contexte();
  const s = nouvelleSession('j', 'web', 'fr');
  const lignes = [];
  for (const texte of ['Envoie 5 000 à Pierre', 'oui']) lignes.push((await traiter(ctx, s, texte)).journal);
  const brut = JSON.stringify(lignes);
  for (const champ of ['equipe', 'canal', 'langue', 'requete', 'intention', 'parametres', 'reponse', 'statut', 'temps_ms', 'erreurs', 'validation']) {
    assert.ok(champ in lignes[0], champ);
  }
  assert.doesNotMatch(brut, /pin|traduit_par|relu_par/i);
});

test('version d\'une réponse propre au canal : utilisée sur ce canal, la version complète ailleurs', async () => {
  const { creerReponses } = await import('../service/reponses.ts');
  const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
  const reponses = creerReponses([{ ref: 'R1', fr: 'Votre solde est de {amount}' }], [], pack, [{ ref: 'R1', canal: 'ussd', cible: 'Court : {amount}' }]);
  const valeurs = { amount: '85 000 FCFA' };
  assert.equal(reponses.rendre({ ref: 'R1', valeurs }, 'bum', 'ussd').texte, 'Court : 85 000 FCFA');
  assert.equal(reponses.rendre({ ref: 'R1', valeurs }, 'bum', 'web').texte, 'Mebal môé: 85 000 FCFA');
  assert.equal(reponses.rendre({ ref: 'R1', valeurs }, 'fr', 'ussd').texte, 'Votre solde est de 85 000 FCFA');
});

test('pendant un transfert, « n\'envoie pas 5 000, envoie 10 000 » corrige le montant au lieu de tout annuler', async () => {
  const ctx = contexte();
  const s = nouvelleSession('nc', 'web', 'fr');
  await traiter(ctx, s, 'Envoie 5 000 à Pierre');
  const tour = await traiter(ctx, s, 'Non, n\'envoie pas 5 000, envoie 10 000');
  assert.equal(tour.journal.statut, 'en_attente_confirmation');
  assert.deepEqual(tour.journal.reponses.map((x) => x.ref), ['RF040', 'RF032', 'RF033']);
  assert.equal(tour.journal.parametres.montant, 10000);
  const seul = await traiter(contexte(), nouvelleSession('nn', 'web', 'fr'), 'N\'envoie pas l\'argent à Paul');
  assert.equal(seul.journal.statut, 'annulee', 'sans opération en cours, la négation n\'exécute rien');
});

test('jamais bloqué : contact inconnu, numéro mal tapé, montant incompris ; chaque fois une question validée, puis abandon sans rien faire', async () => {
  const ctx = contexte();
  const s = nouvelleSession('b', 'ussd', 'bum');
  const dit = async (texte) => (await traiter(ctx, s, texte)).journal;
  await dit('lôm Zorro 5000');
  assert.deepEqual((await dit('Zorro')).reponses.map((x) => [x.ref, x.traduit]), [['RF057', true]], 'un nom absent du carnet : on demande le numéro');
  assert.deepEqual((await dit('12345')).reponses.map((x) => [x.ref, x.traduit]), [['RF063', true]], 'des chiffres qui ne font pas un numéro ne deviennent pas un montant');
  const pret = await dit('677123456');
  assert.equal(pret.statut, 'en_attente_confirmation');
  assert.equal(pret.parametres.montant, 5000);
  const t = nouvelleSession('m', 'ussd', 'bum');
  await traiter(ctx, t, 'envoie à Pierre');
  for (const mot of ['beaucoup', 'rien']) assert.deepEqual((await traiter(ctx, t, mot)).journal.reponses.map((x) => x.ref), ['RF054'], mot);
  const fin = (await traiter(ctx, t, 'toto')).journal;
  assert.equal(fin.statut, 'annulee');
  assert.deepEqual(fin.reponses.map((x) => [x.ref, x.traduit]), [['RF056', true], ['RF110', true]]);
  assert.equal(t.attente, null, 'plus aucune opération en suspens');
});

test('homonymes : on peut répondre par le nom de famille ; « non » pendant une question annule', async () => {
  const ctx = contexte();
  const s = nouvelleSession('h', 'web', 'fr');
  await traiter(ctx, s, 'envoie 2000 à paul');
  const choisi = (await traiter(ctx, s, 'Essomba')).journal;
  assert.equal(choisi.parametres.beneficiaire, 'Paul Essomba');
  assert.equal(choisi.statut, 'en_attente_confirmation');
  const t = nouvelleSession('n2', 'web', 'fr');
  await traiter(ctx, t, 'envoie à Pierre');
  const non = (await traiter(ctx, t, 'non')).journal;
  assert.equal(non.statut, 'annulee');
  assert.deepEqual(non.reponses.map((x) => x.ref), ['RF066']);
});

test('une réponse sans traduction validée cède la place à une plus simple qui en a une', async () => {
  const { creerReponses } = await import('../service/reponses.ts');
  const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
  const reponses = creerReponses([{ ref: 'R1', fr: 'Phrase sans traduction.' }, { ref: 'R2', fr: 'Combien voulez-vous envoyer ?' }], [], pack);
  const rendu = reponses.rendre({ ref: 'R1', repli: { ref: 'R2' } }, 'bum', 'web');
  assert.deepEqual([rendu.ref, rendu.traduit], ['R2', true]);
  assert.equal(reponses.rendre({ ref: 'R1', repli: { ref: 'R2' } }, 'fr', 'web').texte, 'Phrase sans traduction.', 'en français, la réponse elle-même');
});
