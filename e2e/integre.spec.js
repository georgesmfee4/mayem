// Mayem intégré à un site par une balise <script>, dans un navigateur SANS l'extension.
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bulu, nombres, terme } from './donnees.js';

test.use({ channel: process.env.NAVIGATEUR || (process.platform === 'win32' ? 'msedge' : 'chromium') });

const ADRESSE = 'http://127.0.0.1:8765/fixtures/';
const SCRIPT = new URL('../dist-web/mayem.js', import.meta.url);
const integrite = (code) => 'sha384-' + createHash('sha384').update(code).digest('base64');

// Page d'essai à la volée : même contenu que integre.html, balise <script> au choix
async function ouvrir(page, attributs, code = null) {
  if (code !== null) await page.route('**/dist-web/mayem.js', (route) => route.fulfill({ contentType: 'text/javascript', body: code }));
  const html = readFileSync(new URL('../fixtures/integre.html', import.meta.url), 'utf8')
    .replace(/<script src="\.\.\/dist-web\/mayem\.js"[^>]*><\/script>/, `<script src="../dist-web/mayem.js" ${attributs}></script>`);
  await page.route(ADRESSE + 'variante.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(ADRESSE + 'variante.html');
}

test('une ligne dans la page : traduite au chargement, valeurs et saisie intactes', async ({ page }) => {
  await page.goto(ADRESSE + 'integre.html');
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
  await expect(page.locator('#absent')).toHaveText(`${terme('T01')} : 5 000 FCFA`);
  await expect(page.locator('#inconnu')).toHaveAttribute('data-mayem', 'non_verifie');
  await expect(page.locator('#montant')).toHaveValue('5 000');
  await expect(page.locator('#mayem-host #toggle')).toHaveText('Bulu ⇄ original');
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => Mayem.langues())).toEqual([{ langue: 'bum', nom: 'Bulu' }]);

  // Texte ajouté plus tard par le service, puis interrupteur du service
  await page.click('#ajouter');
  await expect(page.locator('#tardif')).toHaveText(bulu('A05'));
  await page.click('#interrupteur');
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
  expect((await nombres(page)).join(' ')).toContain('25 000');
});

test('integrity : le bon hash est exécuté, un mauvais hash bloque le script', async ({ page }) => {
  await ouvrir(page, `integrity="${integrite(readFileSync(SCRIPT))}" data-langue="bum"`);
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
  await page.unrouteAll();
  await ouvrir(page, `integrity="sha384-${'A'.repeat(64)}" data-langue="bum"`);
  await page.waitForTimeout(500);
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
  expect(await page.evaluate(() => typeof window.Mayem)).toBe('undefined');
});

test('data-bouton="non" et data-auto="non" : le service garde la main', async ({ page }) => {
  await ouvrir(page, 'data-bouton="non" data-auto="non"');
  await page.waitForTimeout(300);
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
  await page.evaluate(() => Mayem.demarrer());
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
  await expect(page.locator('#mayem-host')).toHaveCount(0);
  await page.click('#interrupteur');
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
});

test('pack modifié dans le script : refusé par l’empreinte, la page reste en français', async ({ page }) => {
  const erreurs = [];
  page.on('console', (message) => message.type() === 'error' && erreurs.push(message.text()));
  const modifie = readFileSync(SCRIPT, 'utf8').replace(bulu('X08').replace(/\{\w+\}/, '').trim().split(' ')[0], 'Autre');
  await ouvrir(page, 'data-langue="bum"', modifie);
  await page.waitForTimeout(500);
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
  await expect(page.locator('#mayem-host')).toHaveCount(0);
  expect(erreurs.join('\n')).toMatch(/empreinte différente/);
});

test('page de démonstration du refus : Mayem.etat() et l’événement mayem-refus donnent la raison', async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('mayem-refus', (e) => { window.refusRecu = e.detail; }));
  await page.goto(ADRESSE + 'integre-refus.html');
  await expect.poll(() => page.evaluate(() => Mayem.etat().refus)).toMatch(/empreinte différente/);
  expect(await page.evaluate(() => Mayem.etat().actif)).toBe(false);
  expect(await page.evaluate(() => window.refusRecu.raisons[0])).toMatch(/empreinte différente/);
  await expect(page.locator('#mayem-host')).toHaveCount(0);
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
});
