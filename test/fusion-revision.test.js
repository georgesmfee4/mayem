// Réimport du tableur de révision : rien ne se perd, rien n'est invalidé en silence.
// Les mots « bulu » ci-dessous sont des marqueurs d'essai.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionner, ressembleAUneConsigne } from '../tools/fusion-revision.js';

const ligne = (id, fr, bulu) => ({ id, fr, bulu, valide_par: 'Ana / relu par Ben', valide: '1' });
const COLONNES = { ref: 'Réf.', bulu: 'TRADUCTION BULU', traduit: 'Traduit par', relu: 'Relu par' };
function donnees() {
  return {
    corpus: [ligne('P1', 'Annuler', 'Fetek'), ligne('P2', 'Votre solde : {amount}', 'Mebal : {amount}'), ligne('P3', 'Une erreur est survenue', 'Djom dzing éte abé'), ligne('P4', 'Retour', 'Bulan')],
    glossaire: [{ 'Réf.': 'T1', 'TRADUCTION BULU': 'Mebal', 'Traduit par': 'Ana', 'Relu par': 'Ben' }, { 'Réf.': 'T2', 'TRADUCTION BULU': '', 'Traduit par': '', 'Relu par': '' }],
    colonnesGlossaire: COLONNES,
    style: [{ Sujet: 'Tons', Question: 'Tons ?', 'VOTRE RÉPONSE': 'Non' }],
    colonneReponse: 'VOTRE RÉPONSE',
  };
}
const reponse = (ref, bulu, traduit_par = '', relu_par = '', extra = {}) => ({ ref, bulu, decision: '', different: '', traduit_par, relu_par, commentaire: '', codes: ['minuscule'], ...extra });

test('ligne inchangée : la validation reste ; « garder » à deux noms est noté', () => {
  const d = donnees();
  const rapport = fusionner(d, { phrases: [reponse('P1', 'Fetek'), reponse('P4', 'Bulan', 'Ana', 'ben', { decision: 'garder' })] }, '2026-11-11');
  assert.deepEqual(d.corpus[0], ligne('P1', 'Annuler', 'Fetek'));
  assert.deepEqual(rapport.decisions.map((x) => `${x.code}:${x.ref}:${x.bulu}`), ['minuscule:P4:Bulan']);
  assert.equal(rapport.changements.length, 0);
});

test('bulu modifié avec deux noms différents : remplacé et validé', () => {
  const d = donnees();
  const rapport = fusionner(d, { phrases: [reponse('P2', 'Mebal mené : {amount}', 'Ana', 'Carl')] }, '2026-11-11');
  assert.equal(d.corpus[1].bulu, 'Mebal mené : {amount}');
  assert.equal(d.corpus[1].valide_par, 'Ana / relu par Carl');
  assert.match(rapport.changements[0], /P2 : « Mebal : \{amount\} » -> « Mebal mené : \{amount\} »/);
});

test('bulu modifié avec un seul nom (ou deux fois le même) : l\'ancien validé reste, la proposition attend', () => {
  const d = donnees();
  const rapport = fusionner(d, { phrases: [reponse('P1', 'Fetek bo', 'Ana', ''), reponse('P4', 'Bulan mvùs', 'Ana', ' ana ')] }, '2026-11-11');
  assert.equal(d.corpus[0].bulu, 'Fetek');
  assert.equal(d.corpus[0].valide, '1');
  assert.deepEqual(rapport.attente.map((a) => `${a.ref}:${a.nouveau}`), ['P1:Fetek bo', 'P4:Bulan mvùs']);
});

test('consigne, champ {…} perdu, deux propositions différentes : refusés, rien ne change', () => {
  const d = donnees();
  const rapport = fusionner(d, { phrases: [
    reponse('P3', 'nkúán pour dire erreur', 'Ana', 'Ben'),
    reponse('P2', 'Mebal mené', 'Ana', 'Ben'),
    reponse('P1', 'Fetek a', 'Ana', 'Ben'), reponse('P1', 'Fetek b', 'Ana', 'Ben'),
  ] }, '2026-11-11');
  assert.deepEqual(d.corpus.map((l) => l.bulu), ['Fetek', 'Mebal : {amount}', 'Djom dzing éte abé', 'Bulan']);
  assert.equal(rapport.refus.length, 4);
  assert.ok(ressembleAUneConsigne('Zéro = momo', 'abime moné dayiane bô ôsu momo'));
  assert.ok(ressembleAUneConsigne('átáñ', 'Safinum Pay — nlam a démonstration. Teké futié mfi folâ woé.'));
  assert.ok(!ressembleAUneConsigne('Mbamba tyé', 'Mbolo'));
});

test('glossaire : case vide n\'efface rien ; nouveau terme à deux noms ajouté ; charte vide ne remplace rien', () => {
  const d = donnees();
  const rapport = fusionner(d, {
    glossaire: [{ ref: 'T1', bulu: '', choisi_par: 'Ana', relu_par: 'Ben', commentaire: 'Doute sur ce mot' }, { ref: 'T2', bulu: 'Afap', choisi_par: 'Ana', relu_par: 'Ben', commentaire: '' }],
    charte: [{ sujet: 'Tons', question: 'Tons ?', reponse: '', commentaire: '' }, { sujet: 'Apostrophe', question: 'Apostrophe ?', reponse: "'", commentaire: '' }],
  }, '2026-11-11');
  assert.equal(d.glossaire[0]['TRADUCTION BULU'], 'Mebal');
  assert.equal(d.glossaire[1]['TRADUCTION BULU'], 'Afap');
  assert.equal(d.style.find((l) => l.Sujet === 'Tons')['VOTRE RÉPONSE'], 'Non');
  assert.equal(d.style.find((l) => l.Sujet === 'Apostrophe')['VOTRE RÉPONSE'], "'");
  assert.deepEqual(rapport.commentaires.map((c) => c.commentaire), ['Doute sur ce mot']);
});
