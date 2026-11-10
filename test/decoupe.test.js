// m1 : un message fait de phrases connues est traduit phrase par phrase, sans rien inventer.
// m2 : un texte coupé par des balises est traduit en bloc, puis rangé dans ses morceaux d'origine.
// Les phrases viennent du pack : le code ne connaît aucun texte de page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traduire } from '../core/moteur.ts';
import { repartir } from '../core/repartir.ts';

const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
const tr = (texte) => traduire(texte, pack, { test: true });
const phrase = (id) => pack.phrases.find((p) => p.id === id);

// Deux phrases validées, sans champ, qui finissent par un point
const simples = pack.phrases.filter((p) => p.valide && !/\{/.test(p.fr) && /^\p{Lu}.*[.!?]$/u.test(p.fr));
const [a, b] = simples;

test('deux phrases validées réunies : chacune est traduite', () => {
  const res = tr(`${a.fr} ${b.fr}`);
  assert.equal(res.sortie, `${a.bulu} ${b.bulu}`);
  assert.equal(res.id, `${a.id}+${b.id}`);
  assert.equal(res.statut, 'ok');
});

test('une phrase connue et une phrase avec un montant gardent la valeur', () => {
  const res = tr(`${a.fr} Votre solde est de 25 000 FCFA`);
  assert.equal(res.sortie, `${a.bulu} ${phrase('X08').bulu.replace('{amount}', '25 000 FCFA')}`);
  assert.deepEqual(res.valeurs, ['25 000 FCFA']);
});

test('une seule phrase inconnue : tout le message garde l’original', () => {
  const res = tr(`${a.fr} Cette phrase ne figure dans aucun corpus.`);
  assert.equal(res.sortie, null);
  assert.equal(res.statut, 'non_verifie');
  assert.ok(res.categorie);
});

// Traduit le bloc entier puis range le bulu, comme dom/page.ts
function bloc(morceaux) {
  const res = tr(morceaux.join(''));
  return repartir(morceaux, res.sortie, res.valeurs);
}

test('texte coupé avant un montant : le montant reste dans son morceau', () => {
  const textes = bloc(['Votre solde est de ', '25 000 FCFA']);
  assert.deepEqual(textes, [phrase('X08').bulu.replace('{amount}', '').trim(), '25 000 FCFA']);
});

test('montant et nom dans leurs balises : ni l’un ni l’autre ne bouge', () => {
  const textes = bloc(['Vous allez envoyer ', '25 000 FCFA', ' à ', 'Jean-Paul Mbarga']);
  const [avant, entre] = phrase('X13').bulu.split(/\{amount\}|\{name\}/);
  assert.deepEqual(textes, [avant.trim(), '25 000 FCFA', entre.trim(), 'Jean-Paul Mbarga']);
});

test('valeurs remises dans un autre ordre par le bulu : abandon', () => {
  assert.equal(repartir(['Envoyer ', '500 FCFA', ' à ', 'Awa'], 'Awa e nyoñ 500 FCFA', ['500 FCFA', 'Awa']), null);
});

test('bulu sans morceau où se ranger : abandon', () => {
  assert.equal(repartir(['500 FCFA', ' '], 'Mbe 500 FCFA', []), null);
});

test('un chiffre qui change de morceau : abandon', () => {
  assert.equal(repartir(['Étape 2 ', '500 FCFA'], 'Bulu 500 FCFA', []), null);
});
