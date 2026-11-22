// Liste des enregistrements : une phrase à cases se coupe en morceaux, sans les cases ni la ponctuation qui les touchait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listesVoix, morceaux } from '../tools/voix.js';

test('morceaux : les cases et leur ponctuation disparaissent, les morceaux vides aussi', () => {
  assert.deepEqual(morceaux('Mot un : {amount}. Mot deux {name}'), ['Mot un', 'Mot deux']);
  assert.deepEqual(morceaux('{amount}'), []);
});

test('chaque enregistrement a une référence unique et un texte à dire', () => {
  for (const liste of listesVoix()) {
    const refs = liste.phrases.map((p) => p.ref);
    assert.equal(new Set(refs).size, refs.length, liste.langue);
    for (const p of liste.phrases) {
      assert.ok(p.texte.trim(), p.ref);
      assert.doesNotMatch(p.texte, /\{[a-z_0-9]+\}/, p.ref);
    }
  }
});
