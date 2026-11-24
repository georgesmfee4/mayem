// Données d'un service réel (profiles/mtn-cm/) : chaque texte relevé sur un téléphone a sa source, et ne renvoie
// qu'à des écrans du socle commun (flux/argent-mobile/) et à des captures qui existent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireCsv } from '../tools/csv.js';

const lire = (chemin) => lireCsv(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'));
const ecrans = new Set(lire('flux/argent-mobile/parcours.csv').map((l) => l.ref));
const captures = lire('profiles/mtn-cm/captures.csv');
const releves = lire('profiles/mtn-cm/releves.csv');

test('chaque texte relevé renvoie à un écran du socle et à une capture existante', () => {
  const refs = new Set(captures.map((c) => c.ref));
  for (const r of releves) {
    assert.ok(ecrans.has(r.ref), r.ref);
    assert.ok(refs.has(r.capture.split(',')[0]), `${r.ref} : ${r.capture}`);
    assert.ok(r.texte_exact.trim(), r.ref);
  }
});

test('les écrans cités par une capture existent, et chaque texte relevé se lit dans sa capture', () => {
  const texte = Object.fromEntries(captures.map((c) => [c.ref, c.texte]));
  for (const c of captures) for (const ref of c.ecrans.split(',').map((x) => x.trim()).filter(Boolean)) assert.ok(ecrans.has(ref), `${c.ref} : ${ref}`);
  for (const r of releves) assert.ok(texte[r.capture.split(',')[0]].includes(r.texte_exact), `${r.ref} « ${r.texte_exact} »`);
});

test('un code n\'est dit vérifié qu\'avec une source', () => {
  for (const c of lire('profiles/mtn-cm/codes.csv')) assert.ok(c.source.trim(), c.code);
  assert.equal(lire('profiles/mtn-cm/codes.csv').find((c) => c.code === '*123#').fiabilite, 'vérifié');
});
