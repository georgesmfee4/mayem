// Le moteur sur tous les textes réels de la page de test (français et anglais)
// et sur des valeurs piégées. Les valeurs viennent de la page officielle : ce sont
// des données d'essai, le code du moteur n'en connaît aucune.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traduire } from '../core/moteur.ts';

const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
const modeTest = { test: true };
const tr = (texte, p = pack) => traduire(texte, p, modeTest);

test('chaque texte de la page (sans champ) est reconnu, en français et en anglais', () => {
  const phrases = pack.phrases.filter((p) => !p.id.startsWith('X'));
  for (const p of phrases) {
    for (const source of [p.fr, ...p.en]) {
      if (source.includes('{')) continue;
      const r = tr(source);
      assert.equal(r?.statut, 'test', `non reconnu : « ${source} »`);
      assert.equal(r.id, p.id, `mauvaise phrase pour « ${source} »`);
    }
  }
});

test('les textes composés sont reconnus et gardent leurs valeurs', () => {
  const composes = [
    ['Bonjour, Amina', 'A02', ['Amina']],
    ['Hello, Amina', 'A02', ['Amina']],
    ['Numéro de compte : CM 001 2345 6789 01', 'A06', ['CM 001 2345 6789 01']],
    ['Account number: CM 001 2345 6789 01', 'A06', ['CM 001 2345 6789 01']],
    ['Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)', 'F07', ['1,5 %', '100 FCFA', '2 500 FCFA']],
    ['1.5% fee (min. 100 FCFA, max. 2,500 FCFA)', 'F07', ['1.5%', '100 FCFA', '2,500 FCFA']],
    ['Frais de 2 % (min. 200 FCFA, max. 5 000 FCFA)', 'F07', ['2 %', '200 FCFA', '5 000 FCFA']],
    ['Vous allez envoyer 10 000 FCFA à Jean-Paul Mbarga', 'X13', ['10 000 FCFA', 'Jean-Paul Mbarga']],
  ];
  for (const [source, id, valeurs] of composes) {
    const r = tr(source);
    assert.equal(r?.id, id, `composé non reconnu : « ${source} »`);
    assert.ok(r.sortie, `pas de sortie pour « ${source} »`);
    for (const v of valeurs) assert.ok(r.sortie.includes(v), `valeur perdue « ${v} » dans « ${r.sortie} »`);
  }
});

test('un texte fait uniquement de faits n’est jamais touché', () => {
  const faits = ['250 000 FCFA', '-12 500 FCFA', '+180 000 FCFA', '05 nov. 2026', 'Nov 5, 2026', 'Oct 31, 2026',
    'SAF-2026-K3P9QZ', 'SECURITY_002', 'CM 001 2345 6789 01', '+237 6 99 12 34 56', '25 000 FCFA', '2,500 FCFA', '0 FCFA'];
  for (const f of faits) assert.equal(tr(f), null, `fait modifiable : « ${f} »`);
});

test('les noms et les marques ne sont ni traduits ni signalés comme phrases', () => {
  for (const nom of ['Jean-Paul Mbarga', 'Amina Ngo Bell', 'Safinum Pay', 'EN', 'FR', 'Jury']) {
    const r = tr(nom);
    assert.ok(r === null || (!r.sortie && !r.categorie), `nom touché : « ${nom} » -> ${JSON.stringify(r)}`);
  }
});

test('un contenu inédit garde l’original et reçoit une catégorie', () => {
  const inedits = [
    ['Les frais de transfert vers un autre opérateur passent à 150 FCFA à partir de lundi.', 'frais'],
    ['Attention : ne communiquez jamais votre code PIN, même à un agent.', 'securite'],
    ['Le service sera en maintenance ce soir de 22 h à minuit.', 'info'],
    ['Transfer failed: the recipient account is invalid.', 'erreur'],
  ];
  for (const [texte, categorie] of inedits) {
    const r = tr(texte);
    assert.equal(r?.statut, 'non_verifie', texte);
    assert.equal(r.sortie, null, texte);
    assert.equal(r.categorie, categorie, texte);
  }
});

test('une traduction validée passe, et elle est rejetée si elle change un chiffre', () => {
  const copie = structuredClone(pack);
  const x08 = copie.phrases.find((p) => p.id === 'X08');
  Object.assign(x08, { valide: true, bulu: 'BULU {amount}' });
  assert.equal(tr('Votre solde est de 5 000 FCFA', copie).sortie, 'BULU 5 000 FCFA');

  x08.bulu = 'BULU {amount} 2';
  const autre = structuredClone(copie); // nouveau pack, donc nouvel index
  assert.equal(tr('Votre solde est de 5 000 FCFA', autre).statut, 'rejete');
});

test('hors mode test, une phrase non validée garde l’original', () => {
  const r = traduire('Solde', pack);
  assert.equal(r?.statut, 'non_verifie');
  assert.equal(r.sortie, null);
});
