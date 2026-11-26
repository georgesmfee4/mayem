// Page des locuteurs pour le téléphone (tools/kit_service.py --page) : on traduit, le travail reste sur l'appareil,
// le fichier envoyé emporte le travail, le relecteur confirme ou corrige et signe, l'import le reprend.
import { test, expect, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dossier = mkdtempSync(join(tmpdir(), 'mayem-page-'));
let page0 = '';
test.beforeAll(() => {
  execFileSync('python3', ['tools/kit_service.py', 'mtn-cm', '--page', '--dossier', dossier], { stdio: 'ignore' });
  page0 = join(dossier, readdirSync(dossier).find((f) => f.endsWith('.html')));
});

// Le Chromium complet (nouveau mode sans fenêtre), le même que les tests de l'extension
test.use({ channel: 'chromium' });
const telephone = { ...devices['Pixel 7'], acceptDownloads: true };
const carte = (page, debut) => page.locator('article.carte', { has: page.locator('p.francais', { hasText: debut }) });
async function ouvrirGroupe(page, nom) {
  const groupe = page.locator('details.groupe', { has: page.locator('summary', { hasText: nom }) });
  if (!(await groupe.evaluate((d) => d.open))) await groupe.locator('summary').click();
}
async function envoyer(page, bouton) {
  await page.locator('.barre button').click();
  const [fichier] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: bouton }).click()]);
  const chemin = join(dossier, fichier.suggestedFilename());
  await fichier.saveAs(chemin);
  return chemin;
}

test('traduire, garder sur le téléphone, envoyer au relecteur qui confirme ou corrige et signe', async ({ browser }) => {
  const traducteur = await browser.newContext(telephone);
  let page = await traducteur.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto('file://' + page0);
  await page.getByPlaceholder('Votre prénom').fill('Ana');
  await page.getByRole('button', { name: 'Je traduis' }).click();
  await ouvrirGroupe(page, 'Accueil et menus');
  await expect(carte(page, /^Bienvenue aux offres/).locator('p.francais .case')).toHaveText('{name}');
  await carte(page, /^Bienvenue aux offres/).locator('textarea').first().fill('[essai] offres {name}');
  await carte(page, /^Mes offres$/).locator('textarea').first().fill('[essai] offres 3');
  await expect(carte(page, /^Mes offres$/).locator('.controle .mal')).toContainText('Chiffres');

  await page.reload();
  await expect(page.locator('nav.onglets button').first()).toContainText('2/');
  const aRelire = await envoyer(page, 'Envoyer au relecteur');
  await traducteur.close();

  const relecteur = await browser.newContext(telephone);
  page = await relecteur.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto('file://' + aRelire);
  await page.getByPlaceholder('Votre prénom').fill('Ben');
  await page.getByRole('button', { name: 'Je relis' }).click();
  await ouvrirGroupe(page, 'Accueil et menus');
  await expect(carte(page, /^Mes offres$/).getByRole('button', { name: 'C\'est juste' })).toBeDisabled();
  await carte(page, /^Bienvenue aux offres/).getByRole('button', { name: 'C\'est juste' }).click();
  await carte(page, /^Mes offres$/).getByRole('button', { name: 'Corriger' }).click();
  await carte(page, /^Mes offres$/).getByLabel(/Traduction corrigée/).fill('[essai] offres');
  await carte(page, /^Mes offres$/).getByRole('button', { name: 'Garder ma correction' }).click();
  await expect(carte(page, /^Mes offres$/).locator('.statut')).toHaveText('Traduit par Ana · Corrigé et relu par Ben');
  const resultat = await envoyer(page, 'Envoyer le résultat à l\'équipe');
  await relecteur.close();

  const travail = JSON.parse(readFileSync(resultat, 'utf8').match(/<script id="travail" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  expect(travail.items['textes:IU009']).toMatchObject({ t: '[essai] offres {name}', tp: 'Ana', rp: 'Ben', s: 'confirme' });
  expect(travail.items['textes:IU010']).toMatchObject({ t: '[essai] offres', t0: '[essai] offres 3', tp: 'Ana', rp: 'Ben', s: 'corrige' });
  // Le fichier renvoyé reste la page entière, vide de tout rendu : il s'ouvre et se relit comme l'original
  expect(readFileSync(resultat, 'utf8')).toContain('<main id="app"></main>');
});

test('le relecteur ne relit pas sa propre traduction', async ({ browser }) => {
  const ctx = await browser.newContext(telephone);
  const page = await ctx.newPage();
  await page.goto('file://' + page0);
  await page.getByPlaceholder('Votre prénom').fill('Ana');
  await page.getByRole('button', { name: 'Je traduis' }).click();
  await ouvrirGroupe(page, 'Navigation');
  await carte(page, /^Next$/).locator('textarea').first().fill('[essai] suite');
  await page.getByRole('button', { name: 'Changer' }).click();
  await page.getByRole('button', { name: 'Je relis' }).click();
  await ouvrirGroupe(page, 'Navigation');
  await expect(carte(page, /^Next$/)).toContainText('une autre personne doit la relire');
  await expect(carte(page, /^Next$/).getByRole('button', { name: 'C\'est juste' })).toHaveCount(0);
  await ctx.close();
});
