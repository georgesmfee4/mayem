// Le moteur reste rapide quand une langue compte des dizaines de milliers de phrases.
// Pack fabriqué : 10 000 phrases exactes et 10 000 modèles répartis sur 500 premiers mots.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traduire } from '../core/moteur.ts';

const phrase = (id, fr, cible) => ({ id, fr, en: [], cible, critique: false, traduit_par: 'a', relu_par: 'b', retraduit_par: '', retraduction: '', valide: true });
const mot = (i) => 'mot' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + (Math.floor(i / 26) % 26));
const phrases = [];
for (let i = 0; i < 10000; i++) phrases.push(phrase(`E${i}`, `Texte exact numero ${mot(i)} ${mot(i + 7)}`, `Bulu exact ${mot(i)}`));
for (let i = 0; i < 10000; i++) phrases.push(phrase(`M${i}`, `${mot(i % 500)} envoi ${mot(i)} de {amount}`, `Bulu ${mot(i)} {amount}`));
const pack = { langue: 'xx', nom: '', version: '', etiquettes: {}, glossaire: [], phrases };

// Index compris : chaque mesure part d'un pack neuf, que le moteur n'a jamais indexé
function mesurer() {
  const neuf = { ...pack };
  const debut = performance.now();
  for (let i = 0; i < 1000; i++) {
    assert.equal(traduire(`${mot(i % 500)} envoi ${mot(i)} de 5 000 FCFA`, neuf).id, `M${i}`);
    assert.equal(traduire(`Texte exact numero ${mot(i)} ${mot(i + 7)}`, neuf).statut, 'ok');
  }
  return performance.now() - debut;
}

test('20 000 phrases : index et 2 000 recherches en moins de 400 ms', () => {
  // Meilleure de trois mesures : les autres fichiers de test tournent en même temps et chargent la machine
  const duree = Math.min(mesurer(), mesurer(), mesurer());
  assert.ok(duree < 400, `${Math.round(duree)} ms`);
});
