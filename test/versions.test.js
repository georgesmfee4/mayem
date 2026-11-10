// Version et journal d'un pack : une correction augmente le dernier chiffre, un ajout celui du milieu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differences, entreeJournal, versionSuivante } from '../tools/versions.js';
import { empreinte } from '../core/empreinte.ts';

const phrase = (id, bulu, relu_par = 'b') => ({ id, fr: 'Texte', bulu, valide: true, critique: false, relu_par });
const pack = (phrases, glossaire = []) => ({ phrases, glossaire });
const avant = pack([phrase('A1', 'un'), phrase('A2', 'deux')]);

test('rien de changé (sauf un relecteur) : même version', () => {
  const d = differences(avant, pack([phrase('A1', 'un', 'c'), phrase('A2', 'deux')]));
  assert.equal(versionSuivante('0.3.0', d), '0.3.0');
});

test('bulu corrigé : correctif', () => {
  const d = differences(avant, pack([phrase('A1', 'un'), phrase('A2', 'deux bis')]));
  assert.deepEqual(d.phrases.modifies, ['A2']);
  assert.equal(versionSuivante('0.3.0', d), '0.3.1');
});

test('phrase ou terme ajouté ou retiré : version mineure, journal lisible', () => {
  const d = differences(avant, pack([phrase('A1', 'un'), phrase('A3', 'trois')], [{ ref: 'T1', terme: 'solde', bulu: 'x', critique: true }]));
  assert.equal(versionSuivante('0.3.4', d), '0.4.0');
  assert.equal(entreeJournal('0.4.0', '2026-11-10', d), [
    '## 0.4.0 (2026-11-10)',
    '- Phrases ajoutées (1) : A3',
    '- Phrases retirées (1) : A2',
    '- Termes ajoutés (1) : T1',
  ].join('\n'));
});

test('empreinte : stable, ignore son propre champ, change au moindre caractère', async () => {
  const p = { langue: 'xx', version: '1.0.0', empreinte: '', phrases: [phrase('A1', 'un')], glossaire: [] };
  const e = await empreinte(p);
  assert.match(e, /^sha256-[0-9a-f]{64}$/);
  assert.equal(await empreinte({ ...p, empreinte: e }), e);
  assert.notEqual(await empreinte({ ...p, phrases: [phrase('A1', 'uN')] }), e);
});
