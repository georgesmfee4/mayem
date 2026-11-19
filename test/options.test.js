// Options des commandes : --option, option sans tirets, et la forme que npm garde pour lui sous PowerShell.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { option, valeur } from '../tools/options.js';

const avecNpm = (nom, contenu, faire) => {
  process.env[`npm_config_${nom}`] = contenu;
  try { return faire(); } finally { delete process.env[`npm_config_${nom}`]; }
};

test('option sans valeur : --strict, strict, ou gardée par npm ; absente sinon', () => {
  const args = ['bum', '--strict'];
  assert.ok(option(args, 'strict'));
  assert.deepEqual(args, ['bum']);
  assert.ok(option(['strict'], 'strict'));
  assert.ok(avecNpm('strict', 'true', () => option([], 'strict')));
  assert.ok(!option(['bum'], 'strict'));
});

test('option avec valeur : la valeur suit l\'option, ou reste à sa place quand npm a gardé l\'option', () => {
  assert.equal(valeur(['--retirer', 'abc'], 'retirer'), 'abc');
  assert.equal(valeur(['retirer', 'abc'], 'retirer'), 'abc');
  assert.equal(avecNpm('retirer', 'true', () => valeur(['abc'], 'retirer')), 'abc');
  const args = ['lexique.json', 'A,B'];
  assert.equal(avecNpm('retenir', 'true', () => valeur(args, 'retenir', 1)), 'A,B');
  assert.deepEqual(args, ['lexique.json']);
  assert.equal(valeur(['client'], 'retirer'), undefined);
});
