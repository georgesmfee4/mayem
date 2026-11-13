// Textes écrits autrement que le corpus : tout en majuscules, en « Titre », sans accents.
// Un texte à lire est reconnu et signalé ; un nom propre ou une marque n'est jamais touché.
// Les mots « bulu » ci-dessous sont des marqueurs d'essai.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estLangage } from '../core/langage.ts';
import { traduire } from '../core/moteur.ts';

const phrase = (id, fr, bulu) => ({ id, fr, en: [], bulu, critique: true, traduit_par: 'a', relu_par: 'b', retraduit_par: '', retraduction: '', valide: true });
const terme = (ref, francais, bulu) => ({ ref, terme: francais, sens: '', en: '', bulu, critique: true, a_eviter: '', traduit_par: 'A', relu_par: 'B', commentaire: '' });
const pack = {
  langue: 'xx', nom: 'Essai', version: '1.0.0', etiquettes: {},
  phrases: [
    phrase('P1', 'Opération réussie', 'BULU-REUSSI'),
    phrase('P2', 'Votre opération de {amount} a échoué', 'BULU {amount} ECHEC'),
    phrase('P3', 'Côté client', 'BULU-COTE'),
    phrase('P4', 'Coté client', 'BULU-COTATION'),
    phrase('P5', 'Bienvenue sur Banque Kribi', 'BULU-BIENVENUE'),
    phrase('P6', 'Comptes', 'BULU-PLURIEL'),
  ],
  glossaire: [terme('T1', 'solde', 'Zolo'), terme('T2', 'compte', 'Konte')],
};

test('un texte en majuscules ou en « Titre » est un texte à lire s’il contient un mot courant du pack', () => {
  for (const texte of ['NOS COMPTES', 'Votre Solde', 'OPERATIONS', 'Comptes Clients']) assert.ok(estLangage(texte, pack), texte);
});

test('une phrase entière en majuscules est un texte à lire, même sans mot connu', () => {
  assert.ok(estLangage('TRANSACTION ANNULEE PAR LE SYSTEME.', pack));
});

test('un nom propre ou une marque n’est pas un texte à lire', () => {
  // « Kribi » et « Banque » ne sont écrits qu’avec une majuscule dans le corpus : ce ne sont pas des mots courants
  for (const nom of ['Jean-Paul Mbarga', 'Amina Ngo Bell', 'Banque Kribi', 'EN', 'FAQ', 'Kribi Cash']) assert.ok(!estLangage(nom, pack), nom);
});

test('alerte inédite en majuscules : catégorie et termes connus, comme en minuscules', () => {
  const res = traduire('VOTRE SOLDE EST INSUFFISANT POUR CETTE OPÉRATION.', pack);
  assert.equal(res.statut, 'non_verifie');
  assert.equal(res.sortie, null);
  assert.equal(res.categorie, 'erreur');
  assert.deepEqual(res.termes.map((t) => t.ref), ['T1']);
  assert.equal(res.critique, true);
  // Un mot-clé d'erreur ou de sécurité suffit, même si aucun mot n'est dans le pack
  assert.equal(traduire('PAIEMENT REFUSÉ', pack).categorie, 'erreur');
});

test('un nom propre inédit ne reçoit ni catégorie ni terme', () => {
  const res = traduire('Jean-Paul Mbarga', pack);
  assert.equal(res.categorie, null);
  assert.deepEqual(res.termes, []);
});

test('phrase du corpus écrite sans accents : reconnue, avec ses valeurs', () => {
  assert.equal(traduire('OPERATION REUSSIE', pack).sortie, 'BULU-REUSSI');
  assert.equal(traduire('Operation reussie', pack).id, 'P1');
  assert.equal(traduire('Votre operation de 5 000 FCFA a echoue', pack).sortie, 'BULU 5 000 FCFA ECHEC');
});

test('pluriel : traduit seulement s’il est validé comme une phrase du corpus, jamais par le singulier', () => {
  for (const texte of ['Comptes', 'comptes', 'COMPTES']) assert.equal(traduire(texte, pack).sortie, 'BULU-PLURIEL', texte);
  assert.equal(traduire('Compte', pack).sortie, 'Konte');
  assert.equal(traduire('Soldes', pack).sortie, null);
  assert.deepEqual(traduire('Soldes', pack).termes.map((t) => t.ref), ['T1']);
});

test('sans accents, deux phrases qui s’écrivent pareil ne sont pas devinées', () => {
  assert.equal(traduire('Côté client', pack).id, 'P3');
  assert.equal(traduire('Coté client', pack).id, 'P4');
  assert.equal(traduire('Cote client', pack).sortie, null);
});
