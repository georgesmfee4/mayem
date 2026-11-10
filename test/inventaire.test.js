// Inventaire : couverture, modèles regroupés faits masqués, mots absents. Aucune valeur réelle ne sort.
// Les mots « bulu » ci-dessous sont des marqueurs d'essai.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventorier, masquerFaits } from '../core/inventaire.ts';

const phrase = (id, fr, bulu) => ({ id, fr, en: [], bulu, critique: true, traduit_par: 'a', relu_par: 'b', retraduit_par: '', retraduction: '', valide: true });
const terme = (ref, francais, bulu, critique = true) => ({ ref, terme: francais, sens: '', en: '', bulu, critique, a_eviter: '', traduit_par: 'A', relu_par: 'B', commentaire: '' });
const pack = {
  langue: 'xx', nom: 'Essai', version: '1.0.0', etiquettes: {},
  phrases: [phrase('P1', 'Votre solde est de {amount}', 'Zolo {amount}')],
  glossaire: [terme('T1', 'solde', 'Zolo'), terme('T2', 'virement', 'Viré'), terme('T3', 'dans', 'Ete', false)],
};

test('faits masqués et numérotés quand ils se répètent', () => {
  assert.equal(masquerFaits('Envoi de 5 000 FCFA à 690 12 34 56, réf. TX-482913, puis 200 FCFA'), 'Envoi de {amount_1} à {phone}, réf. {ref}, puis {amount_2}');
  assert.equal(masquerFaits('Le 12/11/2026, frais de 1,5 %'), 'Le {date}, frais de {percent}');
});

test('couverture et modèles : les textes qui ne diffèrent que par les valeurs comptent pour un', () => {
  const r = inventorier([
    'Votre solde est de 25 000 FCFA', 'Solde', '12 000 FCFA',
    'Votre virement de 5 000 FCFA est parti dans la journée.', 'Votre virement de 7 500 FCFA est parti dans la journée.',
    'Bienvenue chez nous',
  ], pack);
  assert.deepEqual(r.couverture, { traduit: 2, partiel: 2, absent: 1, rejete: 0, total: 5 });
  assert.deepEqual(r.manques[0], { modele: 'Votre virement de {amount} est parti dans la journée.', occurrences: 2, etat: 'partiel', categorie: 'info', termes: ['virement'] });
  assert.equal(r.manques[1].modele, 'Bienvenue chez nous');
  assert.doesNotMatch(JSON.stringify(r), /5 000|7 500/);
});

test('mots absents : ni dans les phrases validées ni dans le glossaire, par fréquence', () => {
  const r = inventorier(['Votre virement part demain.', 'Le virement arrive demain.'], pack);
  assert.deepEqual(r.motsAbsents.map((m) => m.mot), ['demain', 'part', 'arrive']);
});
