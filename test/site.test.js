// Site de l'API : la documentation suit le contrat OpenAPI, l'accueil suit les langues publiées,
// chaque lien mène quelque part, et l'hébergement sert chaque page sans passer par le Worker.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publier } from '../tools/api.js';
import { nouvelleCle } from './cles-essai.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(chemin, 'utf8');
const lireJson = (chemin) => JSON.parse(lire(chemin));
const openapi = lireJson(join(racine, 'docs/openapi.json'));
const PAGES = ['index.html', 'documentation.html', 'confidentialite.html'];

// Une publication complète, avec le script et les outils que citent les exemples du contrat
let sortie, langues;
before(async () => {
  sortie = mkdtempSync(join(tmpdir(), 'mayem-site-')) + '/';
  const { cle, publique } = await nouvelleCle();
  const version = openapi.components.parameters.script.example;
  const script = { version, packs: [], contenu: Buffer.from('console.log("Mayem");') };
  const coeur = `export { verifierOctets, verifierSignature } from '${pathToFileURL(join(racine, 'core/signature.ts')).href}';\n`;
  langues = await publier({ sortie, cle, cles: [publique], script, coeur });
});
after(() => rmSync(sortie, { recursive: true, force: true }));

test('accueil : langues publiées remplies, lien direct vers la documentation', () => {
  const accueil = lire(sortie + 'index.html');
  const [langue] = langues;
  assert.match(accueil, langues.length > 1 ? /<h2>Langues prises en charge aujourd'hui<\/h2>/ : /<h2>Langue prise en charge aujourd'hui<\/h2>/);
  assert.ok(accueil.includes(`${langue.nom}</span><span class="langue-code">${langue.langue}`));
  assert.ok(accueil.includes(`Version ${langue.derniere.version} du `) && accueil.includes(`, ${langue.phrases_validees} phrases validées`));
  assert.match(accueil, /<a class="bouton" href="documentation">/);
  for (const page of PAGES) assert.doesNotMatch(lire(sortie + page), /<!-- [A-Z]+ -->/, page);
});

test('documentation : chaque adresse du contrat, et chaque exemple public s\'ouvre', () => {
  const doc = lire(sortie + 'documentation.html');
  for (const chemin of Object.keys(openapi.paths)) {
    assert.ok(doc.includes(chemin.replace(/\{(\w+)\}/g, '<em>{$1}</em>')), chemin);
  }
  const exemples = [...doc.matchAll(/class="essayer" href="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  assert.equal(exemples.length, Object.values(openapi.paths).filter((p) => !p.get.security).length);
  for (const exemple of exemples) assert.ok(existsSync(sortie + exemple), exemple);
  assert.doesNotMatch(doc, /class="essayer" href="v1\/exports/);
});

test('chaque lien interne mène à une page du site ou à un fichier de l\'API', () => {
  for (const page of PAGES) {
    const sansCode = lire(sortie + page).replace(/<pre>[\s\S]*?<\/pre>/g, '');
    for (const [, lien] of sansCode.matchAll(/(?:href|src)="([^"#:]+)(?:#[^"]*)?"/g)) {
      const fichier = lien === './' ? 'index.html' : lien.startsWith('v1/') ? decodeURIComponent(lien) : lien.includes('.') ? lien : lien + '.html';
      assert.ok(existsSync(sortie + fichier), `${page} : ${lien}`);
    }
  }
});

test('hébergement : chaque page et chaque ressource du site est servie sans passer par le Worker', () => {
  const regles = lireJson(join(racine, 'hebergement/wrangler.json')).assets.run_worker_first;
  for (const chemin of ['/', '/documentation', '/confidentialite', '/demo', '/studio', '/site.css', '/icone.svg', '/polices/*']) {
    assert.ok(regles.includes('!' + chemin), chemin);
  }
});

test('rédaction : aucun tiret long dans les pages du site', () => {
  for (const nom of ['accueil.html', 'documentation.html', 'confidentialite.html', 'studio.html', 'site.css']) {
    assert.doesNotMatch(lire(join(racine, 'docs', nom)), new RegExp('[\\u2013\\u2014]'), nom);
  }
});

test('studio de voix : listes embarquées, aucune requête réseau, aucun repère restant', () => {
  const page = lire(sortie + 'studio.html');
  assert.doesNotMatch(page, /<!-- [A-Z]+ -->/);
  const listes = JSON.parse(page.match(/<script type="application\/json" id="listes">([\s\S]*?)<\/script>/)[1]);
  assert.ok(listes.length >= 1 && listes.every((l) => l.phrases.length));
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});
