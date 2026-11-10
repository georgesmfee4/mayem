// Ce qui sort de l'équipe Mayem ne contient aucun nom de traducteur, et reste vérifiable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versPublic, nomsInternes } from '../tools/public.js';
import { verifierPack } from '../tools/check-pack.js';
import { empreinte } from '../core/empreinte.ts';
import { exports } from '../tools/export.js';

const interne = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
// « Alexandre et Ronald » : chaque prénom compte
const prenoms = nomsInternes(interne).flatMap((nom) => nom.split(/\s*(?:,|\/|&|\bet\b)\s*/i)).filter((n) => n.length > 2);
const contientUnNom = (texte) => prenoms.filter((nom) => texte.toLowerCase().includes(nom.toLowerCase()));

test('version publique : aucun nom, codes stables, deux personnes toujours vérifiables, empreinte juste', async () => {
  const pub = await versPublic(interne);
  assert.deepEqual(contientUnNom(JSON.stringify(pub)), []);
  assert.deepEqual(verifierPack(pub), []);
  assert.equal(await empreinte(pub), pub.empreinte);
  assert.match(pub.phrases[0].traduit_par, /^Mayem-\d+$/);
  const memeNom = interne.phrases.filter((p) => p.traduit_par.toLowerCase() === interne.phrases[0].traduit_par.toLowerCase());
  assert.ok(memeNom.every((p) => pub.phrases.find((q) => q.id === p.id).traduit_par === pub.phrases[0].traduit_par));
  assert.equal(pub.producteur, 'Équipe Mayem');
});

test('exports : aucun nom, mention des droits Mayem', async () => {
  const fichiers = exports(await versPublic(interne));
  for (const [chemin, texte] of Object.entries(fichiers)) {
    assert.deepEqual(contientUnNom(texte), [], chemin);
    if (!chemin.endsWith('.json')) assert.match(texte, /Équipe Mayem — Tous droits réservés/, chemin);
  }
});
