// Révision de fidélité : un test par contrôle, avec un cas signalé et un cas proche qui ne l'est pas.
// Les mots « bulu » ci-dessous sont des marqueurs d'essai, pas des traductions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviser } from '../tools/revision.js';

const phrase = (id, fr, bulu, critique = false, en = []) => ({ id, fr, en, bulu, critique, traduit_par: 'a', relu_par: 'b', retraduit_par: '', retraduction: '', valide: true });
const terme = (ref, francais, bulu, critique = true, sens = 'Définition') => ({ ref, terme: francais, sens, en: '', bulu, critique, a_eviter: '', traduit_par: 'A', relu_par: 'B', commentaire: '' });
const codes = (constats, code) => constats.filter((c) => c.code === code);
const revoir = (phrases, glossaire = [], contexte = {}, politesse = '') => reviser({ phrases, glossaire, contexte, politesse });

test('sens confondus : bloquant si critique et non critique se mêlent ; même français, rien à signaler', () => {
  const c = revoir([phrase('A', 'Alerte de sécurité', 'Zak', true), phrase('B', 'Sécurité', 'zak'), phrase('C', 'Bonjour', 'Mbo'), phrase('D', 'Bienvenue', 'Mbo')]);
  const groupes = codes(c, 'sens-confondus');
  assert.deepEqual(groupes.map((g) => `${g.ref}:${g.niveau}`), ['A+B:bloquant', 'C+D:à revoir']);
  assert.equal(codes(revoir([phrase('A', 'Retour', 'Bul'), phrase('B', 'Retour', 'Bul')]), 'sens-confondus').length, 0);
});

test('glossaire : mots entiers seulement (« ôsu » face à « Ôsusua »), et même terme pour deux idées', () => {
  const c = revoir([], [terme('G1', 'au moins', 'ôsu'), terme('T1', 'continuer', 'Kele ôsu'), terme('T2', 'avant de', 'Ôsusua na'), terme('T3', 'mot de passe', 'Nten'), terme('T4', 'code secret', 'Nten')]);
  assert.deepEqual(codes(c, 'glossaire-inclus').map((x) => x.ref), ['G1+T1']);
  assert.deepEqual(codes(c, 'glossaire-double').map((x) => x.ref), ['T3+T4']);
});

test('glossaire : formes grammaticales (« le montant : singulier ») et petits mots non critiques ignorés', () => {
  const c = revoir([], [terme('T1', 'montant', 'Abime'), terme('N1', 'le montant : singulier', 'Abime'), terme('L1', 'de', 'ya', false), terme('T2', 'code de confirmation', 'Nten ya tsin')]);
  assert.equal(codes(c, 'glossaire-double').length + codes(c, 'glossaire-inclus').length, 0);
});

test('terme critique absent : trouvé au pluriel et conjugué ; présent : rien', () => {
  const glossaire = [terme('T1', 'confirmer', 'Ntiñ'), terme('T2', 'frais', 'Minkuk')];
  const c = revoir([phrase('P1', 'Vous confirmez le transfert.', 'Bo ya.'), phrase('P2', 'Confirmez le transfert.', 'Ntiñ ya.')], glossaire);
  assert.deepEqual(codes(c, 'terme-critique').map((x) => x.ref), ['P1']);
  assert.match(codes(c, 'terme-critique')[0].explication, /« Ntiñ »/);
});

test('négation absente du bulu : signalée', () => {
  const glossaire = [terme('G1', 'jamais (ne… jamais)', 'Amos dzing', true, '« Ne partagez jamais »')];
  const c = revoir([phrase('P1', 'Ne partagez jamais votre code.', 'Yôle nten.'), phrase('P2', 'Ne partagez jamais votre code.', 'Amos dzing yôle nten.')], glossaire);
  assert.deepEqual(codes(c, 'negation').map((x) => x.ref), ['P1']);
});

test('glossaire sans traduction : critiques d\'abord', () => {
  const c = revoir([], [terme('T1', 'plafond', '', false), terme('T2', 'frais', '', true), terme('T3', 'solde', 'Mebal')]);
  assert.deepEqual(codes(c, 'glossaire-vide').map((x) => x.ref), ['T2', 'T1']);
});

test('orthographe : minuscule initiale, majuscule hors marque, apostrophe minoritaire, espaces, ponctuation', () => {
  const phrases = [
    phrase('P1', 'Envoyer', 'kele'),
    phrase('P2', 'Payer avec Mobile Money', 'Bo Mobile Money'),
    phrase('P3', 'Payer vite', 'Bo Vite'),
    phrase('P4', 'Un', "w'a"), phrase('P5', 'Deux', "w'e"), phrase('P6', 'Trois', 'w’i'),
    phrase('P7', 'Fini.', 'Bo  ya'),
  ];
  const c = revoir(phrases);
  assert.deepEqual(codes(c, 'minuscule').map((x) => x.ref), ['P1', 'P4', 'P5', 'P6']);
  assert.deepEqual(codes(c, 'majuscule').map((x) => x.ref), ['P3']);
  assert.deepEqual(codes(c, 'apostrophe').map((x) => x.ref), ['P6']);
  assert.deepEqual(codes(c, 'espaces').map((x) => x.ref), ['P7']);
  assert.deepEqual(codes(c, 'ponctuation').map((x) => x.ref), ['P7']);
});

test('majuscules des mots du glossaire : une seule question de charte, pas une par phrase', () => {
  const c = revoir([phrase('P1', 'Voir le solde', 'Yené Mebal'), phrase('P2', 'Votre solde', 'Mebal ya')], [terme('T1', 'solde', 'Mebal')]);
  assert.equal(codes(c, 'majuscule').length, 0);
  assert.equal(codes(c, 'majuscule-glossaire').length, 1);
});

test('alphabet : ɔ et ŋ signalés, ô et ñ acceptés', () => {
  const c = revoir([phrase('P1', 'Un', 'Mɔŋ'), phrase('P2', 'Deux', 'Ntiñ ô')]);
  assert.deepEqual(codes(c, 'alphabet').map((x) => x.ref), ['P1']);
});

test('politesse : la forme minoritaire est interrogée, avec la réponse de la charte', () => {
  const c = revoir([phrase('P1', 'Un', "W'ake"), phrase('P2', 'Deux', 'Wo bo'), phrase('P3', 'Trois', 'ô tuá')], [], {}, 'on va utiliser le : Wo');
  assert.deepEqual(codes(c, 'politesse').map((x) => x.ref), ['P3']);
  assert.match(codes(c, 'politesse')[0].explication, /La charte dit : « on va utiliser le : Wo »/);
});

test('boutons : plus de 3 mots signalé, libellé court non ; consigne recopiée', () => {
  const contexte = { B1: { element: 'Bouton', consigne: 'Action définitive' }, B2: { element: 'Bouton' }, T1: { element: 'Titre' } };
  const c = revoir([phrase('B1', 'Envoyer', 'e bô nlo ya'), phrase('B2', 'Annuler', 'Fetek'), phrase('T1', 'Titre', 'a b c d e')], [], contexte);
  const longs = codes(c, 'bouton-long');
  assert.deepEqual(longs.map((x) => x.ref), ['B1']);
  assert.equal(longs[0].consigne, 'Action définitive');
});
