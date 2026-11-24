// Textes lus sur de vrais écrans (flux/argent-mobile/textes.csv) : un texte de référence par sens, commun à tous les
// services ; les noms de service y sont une case {name}. Les captures (profiles/mtn-cm/captures.csv) en sont la source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireCsv } from '../tools/csv.js';
import { traduire } from '../core/moteur.ts';

const lire = (chemin) => lireCsv(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'));
const textes = lire('flux/argent-mobile/textes.csv');
const captures = lire('profiles/mtn-cm/captures.csv');
const noms = lire('profiles/mtn-cm/services.csv').flatMap((s) => s.nom.split(/,\s*/)).filter((n) => n.length > 2);

test('chaque texte de référence est unique et renvoie à des captures qui existent, et inversement', () => {
  const refs = new Set(captures.map((c) => c.ref));
  assert.equal(new Set(textes.map((t) => t.texte)).size, textes.length);
  for (const t of textes) for (const c of t.captures.split(' ')) assert.ok(refs.has(c), `${t.ref} : ${c}`);
  const connus = new Set(textes.map((t) => t.ref));
  for (const c of captures) for (const ref of c.textes.split(', ').filter(Boolean)) assert.ok(connus.has(ref), `${c.ref} : ${ref}`);
});

test('aucun texte de référence n\'est figé à un service : les noms y sont la case {name}', () => {
  for (const t of textes.filter((x) => x.portee === 'commun')) {
    for (const nom of noms) assert.ok(!t.texte.includes(nom) || t.texte === nom, `${t.ref} « ${t.texte} » contient ${nom}`);
    assert.doesNotMatch(t.texte, /\b(MTN|MoMo|Orange|GIMACPAY|ENEO|Camwater)\b/i, t.ref);
  }
});

test('les cases d\'un texte sont les mêmes dans chacune de ses autres écritures', () => {
  const cases = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const t of textes) for (const forme of t.formes_vues.split('|').map((f) => f.trim()).filter(Boolean)) assert.equal(cases(forme), cases(t.texte), t.ref);
});

test('aucun nom ni numéro de titulaire dans les captures', () => {
  for (const c of captures) assert.doesNotMatch(c.texte, /\b6\s?\d{2}(\s?\d{2}){3}\b/, c.ref);
});

test('un code n\'est dit vérifié qu\'avec une source', () => {
  const codes = lire('profiles/mtn-cm/codes.csv');
  for (const c of codes) assert.ok(c.source.trim(), c.code);
  assert.equal(codes.find((c) => c.code === '*123#').fiabilite, 'vérifié');
});

test('un texte de référence avec {name} vaut pour tous les services : le nom reste tel quel', () => {
  const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
  const phrase = { id: 'IU900', fr: 'Bienvenue aux offres {name}', en: [], cible: '[essai] offres {name}', critique: false, valide: true };
  const essai = { ...pack, phrases: [...pack.phrases, phrase] };
  for (const service of ['MTN', 'Orange', 'Camtel Blue']) {
    assert.equal(traduire(`Bienvenue aux offres ${service}`, essai)?.sortie, `[essai] offres ${service}`, service);
  }
});
