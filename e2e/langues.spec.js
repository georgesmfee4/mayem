import { test, expect, ADRESSE } from './extension.js';
import { bulu, nombres } from './donnees.js';

test.use({ copie: 'deux-langues' });

const liste = (page) => page.locator('#mayem-host select');

test('deux langues : la page change de langue sans recharger, chiffres et saisie intacts', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'balises.html');
  const avant = await nombres(page);
  await cliquer(page);
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
  await expect(page.locator('#solde')).toHaveAttribute('lang', 'bum');
  await expect(liste(page)).toBeVisible();

  await liste(page).selectOption('zzz');
  await expect(page.locator('#solde')).toHaveText('[zz] Votre solde est de 25 000 FCFA');
  await expect(page.locator('#solde')).toHaveAttribute('lang', 'zzz');
  await expect(page.locator('#mayem-host #toggle')).toHaveText('Essai ⇄ original');
  await expect(page.locator('#montant')).toHaveValue('5 000');
  expect(await nombres(page)).toEqual(avant);

  await liste(page).selectOption('bum');
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
  await expect(page.locator('#message')).toHaveText(`${bulu('A04')} ${bulu('S02')}`);

  // Bascule vers l'original après un changement de langue : le texte du service revient tel quel
  await page.locator('#mayem-host #toggle').click();
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
});

test('le cadre suit la langue choisie dans la page principale', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'iframe.html');
  await cliquer(page);
  await liste(page).selectOption('zzz');
  const cadre = page.frameLocator('iframe');
  await expect(cadre.locator('body')).toContainText('[zz]');
});
