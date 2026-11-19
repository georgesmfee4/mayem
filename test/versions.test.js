// Version et journal d'un pack : une correction augmente le dernier chiffre, un ajout celui du milieu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differences, entreeJournal, versionSuivante } from '../tools/versions.js';
import { empreinte } from '../core/empreinte.ts';

const phrase = (id, cible, relu_par = 'b') => ({ id, fr: 'Texte', cible, valide: true, critique: false, relu_par });
const pack = (phrases, glossaire = []) => ({ phrases, glossaire });
const avant = pack([phrase('A1', 'un'), phrase('A2', 'deux')]);

test('rien de changé (sauf un relecteur) : même version', () => {
  const d = differences(avant, pack([phrase('A1', 'un', 'c'), phrase('A2', 'deux')]));
  assert.equal(versionSuivante('0.3.0', d), '0.3.0');
});

test('signature ou retraduction ajoutée à une version déjà archivée : correctif, journal sans traduction changée', () => {
  const d = { ...differences(avant, pack([phrase('A1', 'un', 'c'), phrase('A2', 'deux')])), suivi: true };
  assert.equal(versionSuivante('0.7.1', d), '0.7.2');
  assert.match(entreeJournal('0.7.2', '2026-11-19', d), /aucune traduction changée/);
});

test('bulu corrigé : correctif', () => {
  const d = differences(avant, pack([phrase('A1', 'un'), phrase('A2', 'deux bis')]));
  assert.deepEqual(d.phrases.modifies, ['A2']);
  assert.equal(versionSuivante('0.3.0', d), '0.3.1');
});

test('phrase ou terme ajouté ou retiré : version mineure, journal lisible', () => {
  const d = differences(avant, pack([phrase('A1', 'un'), phrase('A3', 'trois')], [{ ref: 'T1', terme: 'solde', cible: 'x', critique: true }]));
  assert.equal(versionSuivante('0.3.4', d), '0.4.0');
  assert.equal(entreeJournal('0.4.0', '2026-11-10', d), [
    '## 0.4.0 (2026-11-10)',
    '- Phrases ajoutées (1) : A3',
    '- Phrases retirées (1) : A2',
    '- Termes ajoutés (1) : T1',
  ].join('\n'));
});

test('passage au format 2 : version mineure, et l\'ancienne forme compte comme les mêmes traductions', () => {
  const ancien = pack([{ id: 'A1', fr: 'Texte', bulu: 'un', valide: true, critique: false }]);
  const d = differences(ancien, { format: 2, ...pack([phrase('A1', 'un')]) });
  assert.deepEqual(d.phrases.modifies, []);
  assert.equal(versionSuivante('0.5.3', d), '0.6.0');
  assert.equal(entreeJournal('0.6.0', '2026-11-19', d),
    '## 0.6.0 (2026-11-19)\n- Format 2 du pack (packs/schema.json) ; aucune traduction changée par ce passage');
  assert.equal(versionSuivante('0.6.0', differences({ format: 2, ...avant }, { format: 2, ...avant })), '0.6.0');
});

test('empreinte : stable, ignore son propre champ, change au moindre caractère', async () => {
  const p = { langue: 'xx', version: '1.0.0', empreinte: '', phrases: [phrase('A1', 'un')], glossaire: [] };
  const e = await empreinte(p);
  assert.match(e, /^sha256-[0-9a-f]{64}$/);
  assert.equal(await empreinte({ ...p, empreinte: e }), e);
  assert.notEqual(await empreinte({ ...p, phrases: [phrase('A1', 'uN')] }), e);
});
