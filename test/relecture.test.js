// Tableur de relecture : négations d'abord, une ligne par phrase d'un point, décisions « garder » mémorisées
// tant que le bulu ne change pas. Les mots « bulu » ci-dessous sont des marqueurs d'essai.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lignesRelecture } from '../tools/relecture.js';
import { pointsOuverts } from '../tools/decisions.js';
import { controler } from '../core/controle.ts';

const phrase = (id, fr, bulu) => ({ id, fr, en: [], bulu, critique: true, traduit_par: 'a', relu_par: 'b', retraduit_par: '', retraduction: '', valide: true });
const terme = (ref, francais, bulu) => ({ ref, terme: francais, sens: '', en: '', bulu, critique: true, a_eviter: '', traduit_par: 'A', relu_par: 'B', commentaire: '' });
const pack = {
  langue: 'xx', nom: 'Essai', version: '1.0.0', etiquettes: {},
  glossaire: [terme('T1', 'solde', 'Zolo'), terme('T2', 'jamais (ne… jamais)', 'Jamo dzi')],
  phrases: [
    phrase('P1', 'Solde disponible', 'Mebi'),
    phrase('P2', 'Bonjour', 'Mbo'), phrase('P3', 'Bienvenue', 'Mbo'),
    phrase('P4', 'Ne partagez jamais ce code.', 'Pako yôle'),
  ],
};

test('négations d’abord ; un point de cohérence donne une ligne par phrase, même numéro', () => {
  const lignes = lignesRelecture(pack);
  assert.deepEqual(lignes.map((l) => `${l.numero}:${l.ref}:${l.cle_type}`), ['1:P4:negation', '2:P1:glossaire', '3:P2:coherence', '3:P3:coherence']);
  assert.match(lignes[0].signale, /négation \(« jamais »\).*« Jamo dzi »/);
  assert.match(lignes[2].signale, /Le même bulu « Mbo » sert pour : P2 « Bonjour », P3 « Bienvenue »/);
  assert.equal(lignes[2].point, 'P2+P3');
});

test('« garder » : le point n’est plus redemandé, sauf si son bulu change', () => {
  const decisions = [{ type: 'negation', point: 'P4', ref: 'P4', bulu: 'Pako yôle' }];
  assert.deepEqual(pointsOuverts(controler(pack), decisions, pack).map((p) => p.type), ['glossaire', 'coherence']);
  const change = structuredClone(pack);
  change.phrases[3].bulu = 'Pako yôle bo';
  assert.ok(pointsOuverts(controler(change), decisions, change).some((p) => p.type === 'negation'));
});

test('cohérence : réglée seulement quand chaque phrase du point est gardée', () => {
  const une = [{ type: 'coherence', point: 'P2+P3', ref: 'P2', bulu: 'Mbo' }];
  assert.ok(pointsOuverts(controler(pack), une, pack).some((p) => p.type === 'coherence'));
  const deux = [...une, { type: 'coherence', point: 'P2+P3', ref: 'P3', bulu: 'Mbo' }];
  assert.ok(!pointsOuverts(controler(pack), deux, pack).some((p) => p.type === 'coherence'));
});
