// API de distribution : liste des contributeurs à faire signer, même écrits de façons différentes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contributeurs } from '../tools/api.js';

test('contributeurs : plusieurs noms par case, casse unifiée, majuscule gardée', () => {
  const pack = {
    phrases: [{ traduit_par: 'lesly', relu_par: 'Alexandre et Ronald', retraduit_par: '' }, { traduit_par: 'Lesly', relu_par: 'Bene / Carrel', retraduit_par: 'Ana, Ben' }],
    glossaire: [{ traduit_par: 'ronald', relu_par: '' }],
  };
  assert.deepEqual(contributeurs(pack), ['Lesly', 'Alexandre', 'Ronald', 'Bene', 'Carrel', 'Ana', 'Ben']);
});
