// Pseudo-langue : 40 % plus longue, encadrée, mêmes champs et mêmes valeurs ; le pack reste valide.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pseudo, packPseudo } from '../tools/pseudo.js';
import { verifierPack } from '../tools/check-pack.js';
import { empreinte } from '../core/empreinte.ts';
import { traduire } from '../core/moteur.ts';

test('au moins 40 % plus long, encadré, lettres du bulu', () => {
  const texte = 'Confirmer le transfert';
  const sortie = pseudo(texte);
  assert.ok(sortie.length >= texte.length * 1.4, sortie);
  assert.match(sortie, /^⟦Côñfírmér lé tráñsfért .*⟧$/);
  assert.match(sortie, /[ɔŋ]/);
});

test('champs, montants, références et dates gardés tels quels', () => {
  assert.match(pseudo('Envoi de {amount} à {name}'), /\{amount\} à \{name\}/);
  assert.match(pseudo('Frais : 5 000 FCFA, réf. TX-482913, le 12/11/2026'), /5 000 FCFA, réf\. TX-482913, lé 12\/11\/2026/);
});

test('pack pseudo : valide, empreinte juste, et le moteur l’affiche', async () => {
  const vrai = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
  const pack = await packPseudo(vrai);
  assert.equal(pack.langue, 'qps');
  assert.deepEqual(verifierPack(pack), []);
  assert.equal(await empreinte(pack), pack.empreinte);
  assert.match(traduire('Votre solde est de 25 000 FCFA', pack).sortie, /^⟦Vôtré sôldé ést dé 25 000 FCFA .*⟧$/);
  assert.match(traduire('Solde', pack).sortie, /^⟦Sôldé/);
});
