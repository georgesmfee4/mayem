// Fichier pour la boutique : ce qui doit le faire refuser avant tout dépôt.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { controler, zipper } from '../tools/boutique.js';

function dist(manifeste, contenu = 'console.log(1);') {
  const ici = mkdtempSync(join(tmpdir(), 'mayem-boutique-'));
  mkdirSync(join(ici, 'icones')); mkdirSync(join(ici, 'dom'));
  writeFileSync(join(ici, 'icones', '128.png'), 'png');
  writeFileSync(join(ici, 'dom', 'fond.js'), contenu);
  writeFileSync(join(ici, 'manifest.json'), JSON.stringify(manifeste));
  return ici;
}
const bon = { permissions: ['activeTab', 'scripting'], icons: { 128: 'icones/128.png' } };
const ENTREE = 'const MODE_TEST = false;';

test('un dist conforme passe ; permissions larges, script automatique, MODE_TEST ou nom de traducteur : refusé', () => {
  const ok = dist(bon);
  assert.deepEqual(controler(ok, ENTREE, ['Georgette']), []);
  assert.match(controler(ok, 'const MODE_TEST = true;', []).join(), /MODE_TEST/);
  const large = dist({ ...bon, permissions: ['activeTab', 'scripting', 'tabs'], content_scripts: [{}] });
  assert.equal(controler(large, ENTREE, []).length, 2);
  const nomme = dist(bon, '// relu par Georgette');
  assert.match(controler(nomme, ENTREE, ['Georgette']).join(), /nom de traducteur/);
  for (const d of [ok, large, nomme]) rmSync(d, { recursive: true, force: true });
});

test('le zip contient chaque fichier, compressé et relisible', () => {
  const ici = dist(bon, 'console.log("Mayem");');
  const zip = zipper(ici);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 3);
  const nom = zip.subarray(30, 30 + zip.readUInt16LE(26)).toString();
  assert.equal(nom, 'dom/fond.js');
  const debut = 30 + nom.length;
  assert.equal(inflateRawSync(zip.subarray(debut, debut + zip.readUInt32LE(18))).toString(), 'console.log("Mayem");');
  rmSync(ici, { recursive: true, force: true });
});
