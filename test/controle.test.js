// Contrôle des traductions : glossaire, cohérence, négations, sur de petits packs fabriqués.
// Les mots « bulu » ci-dessous sont des marqueurs d'essai, pas des traductions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controler } from '../core/controle.ts';

const phrase = (id, fr, bulu) => ({ id, fr, en: [], bulu, critique: true, traduit_par: 'a', relu_par: 'b', retraduit_par: '', retraduction: '', valide: true });
const terme = (ref, francais, bulu, critique = true) => ({ ref, terme: francais, sens: '', en: '', bulu, critique, a_eviter: '', traduit_par: 'a', relu_par: 'b', commentaire: '' });
const pack = (phrases, glossaire = []) => ({ langue: 'xx', nom: '', version: '', orthographe: '', etiquettes: {}, glossaire, phrases });
const types = (p) => controler(p).map((point) => `${point.type}:${point.ids.join('+')}`);

const GLOSSAIRE = [
  terme('T1', 'solde', 'Zolo'),
  terme('T2', 'frais / commission', 'Kufa / Kufo'),
  terme('T3', 'votre / vos', 'wo (à accorder)'),
  terme('T4', 'jamais (ne… jamais)', 'Jamo dzi'),
  terme('T5', 'ne… pas', 'Pako'),
];

test('terme du glossaire présent : rien à signaler, accents et casse ignorés', () => {
  assert.deepEqual(types(pack([phrase('P1', 'Votre solde', 'zôlo wo')], GLOSSAIRE)), []);
});

test('terme du glossaire absent : signalé ; une des formes « / » suffit', () => {
  assert.deepEqual(types(pack([phrase('P1', 'Solde disponible', 'Mebi')], GLOSSAIRE)), ['glossaire:P1']);
  assert.deepEqual(types(pack([phrase('P2', 'Commission', 'Kufo')], GLOSSAIRE)), []);
});

test('entrée grammaticale avec explication et terme non critique : jamais exigés', () => {
  const glossaire = [...GLOSSAIRE, terme('T6', 'compte', 'Kont', false)];
  assert.deepEqual(types(pack([phrase('P1', 'Votre compte', 'Abc')], glossaire)), []);
});

test('même bulu pour deux sens, même français traduit de deux façons', () => {
  assert.deepEqual(types(pack([phrase('P1', 'Bonjour', 'Mbo'), phrase('P2', 'Bienvenue', 'mbo')])), ['coherence:P1+P2']);
  assert.deepEqual(types(pack([phrase('P1', 'Retour', 'Bula'), phrase('P2', 'retour', 'Kele')])), ['coherence:P1+P2']);
});

test('négation : la plus précise est attendue, présente ou absente', () => {
  assert.deepEqual(types(pack([phrase('P1', 'Ne partagez jamais ce code.', 'Jamo dzi yôle')], GLOSSAIRE)), []);
  assert.deepEqual(types(pack([phrase('P2', 'Ne partagez jamais ce code.', 'Pako yôle')], GLOSSAIRE)), ['negation:P2']);
  assert.deepEqual(types(pack([phrase('P3', "Ce n'est pas possible.", 'Pako bo')], GLOSSAIRE)), []);
});

test('phrase non validée : pas contrôlée', () => {
  const brouillon = { ...phrase('P1', 'Solde', 'Mebi'), valide: false };
  assert.deepEqual(types(pack([brouillon], GLOSSAIRE)), []);
});
