// Exports standards : seules les phrases validées sortent, XML bien formé, champs convertis sans perte.
// Les mots « bulu » ci-dessous sont des marqueurs d'essai, pas des traductions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exports } from '../tools/export.js';

const phrase = (id, fr, bulu, valide = true) => ({ id, fr, en: [], bulu, critique: true, traduit_par: 'A', relu_par: 'B', retraduit_par: '', retraduction: '', valide });
const pack = {
  langue: 'xx', nom: 'Essai', version: '1.2.3', glossaire: [
    { ref: 'T1', terme: 'solde', sens: 'argent <disponible>', bulu: 'Zolo / Zola', critique: true, a_eviter: 'Zul', traduit_par: 'A', relu_par: 'B' },
    { ref: 'T2', terme: 'vide', sens: '', bulu: '', critique: false, a_eviter: '' },
  ],
  phrases: [
    phrase('P1', 'Frais de {percent} sur {amount}', 'Kufa {amount} « {percent} »'),
    phrase('P2', "L'opération & le \"reçu\"", "Bo'o & \"mvae\""),
    phrase('P3', 'Brouillon', 'Pas validé', false),
  ],
};
const fichiers = exports(pack);

// Contrôle léger de forme : balises équilibrées, aucun & ou < nu dans le texte
function bienForme(xml) {
  const pile = [];
  for (const [balise, fermante, nom, auto] of xml.replace(/^<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:.+-]+)[^<>]*?(\/?)>/g)) {
    if (auto) continue;
    if (!fermante) pile.push(nom);
    else assert.equal(pile.pop(), nom, `balise ${balise} mal fermée`);
  }
  assert.equal(pile.length, 0, `balises ouvertes : ${pile}`);
  assert.doesNotMatch(xml, /&(?!(amp|lt|gt|quot|apos);)/);
  assert.doesNotMatch(xml.replace(/<[^<>]*>/g, ''), /[<>]/);
}

test('sept fichiers, tous les XML bien formés', () => {
  assert.equal(Object.keys(fichiers).length, 7);
  for (const [chemin, texte] of Object.entries(fichiers)) if (!chemin.endsWith('.json')) bienForme(texte);
});

test('phrase non validée et terme sans traduction : jamais exportés', () => {
  for (const texte of Object.values(fichiers)) assert.doesNotMatch(texte, /Brouillon|Pas validé|>vide</);
});

test('TMX et XLIFF : droits Mayem, aucune personne, langue et caractères échappés', () => {
  assert.match(fichiers['xx.tmx'], /x-droits">© Équipe Mayem — Tous droits réservés/);
  assert.match(fichiers['xx.tmx'], /<tu tuid="P2">[\s\S]*xml:lang="xx"><seg>Bo'o &amp; &quot;mvae&quot;<\/seg>/);
  assert.doesNotMatch(fichiers['xx.tmx'], /traduit-par|relu-par/);
  assert.match(fichiers['xx.xlf'], /target-language="xx"[\s\S]*<trans-unit id="P1" approved="yes">[\s\S]*deux relecteurs de l'équipe Mayem/);
});

test('TBX : chaque forme est un terme, la mise en garde une note', () => {
  const tbx = fichiers['glossaire.tbx'];
  assert.match(tbx, /<term>Zolo<\/term>[\s\S]*<note>À éviter : Zul<\/note>[\s\S]*<term>Zola<\/term>/);
  assert.match(tbx, /argent &lt;disponible&gt;/);
});

test('i18next : {nom} devient {{nom}}', () => {
  assert.equal(JSON.parse(fichiers['i18next/xx.json']).P1, 'Kufa {{amount}} « {{percent}} »');
});

test('Android : arguments numérotés dans l’ordre du français, apostrophes et guillemets échappés', () => {
  const xx = fichiers['android/values-b+xx/strings.xml'];
  assert.match(fichiers['android/values/strings.xml'], /name="mayem_p1">Frais de %1\$s sur %2\$s</);
  assert.match(xx, /name="mayem_p1">Kufa %2\$s « %1\$s »</);
  assert.match(xx, /name="mayem_p2">Bo\\'o &amp; \\"mvae\\"</);
});

test('le vrai pack s’exporte et garde les chiffres de chaque phrase', () => {
  const vrai = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
  const sortie = exports(vrai);
  for (const [chemin, texte] of Object.entries(sortie)) if (!chemin.endsWith('.json')) bienForme(texte);
  const bum = JSON.parse(sortie['i18next/bum.json']);
  for (const p of vrai.phrases.filter((x) => x.valide)) {
    assert.deepEqual((bum[p.id].match(/\d+/g) || []).sort(), (p.fr.match(/\d+/g) || []).sort(), p.id);
  }
});
