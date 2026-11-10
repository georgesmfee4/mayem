import { test, expect, ADRESSE } from './extension.js';
import { bulu, nombres } from './donnees.js';

test('rendu à la React en anglais : écrans recréés, montants au format anglais', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'react.html');
  const avant = await nombres(page);
  await cliquer(page);
  const lignes = page.locator('#app main > p');
  await expect(lignes.nth(0)).toHaveText(bulu('X08', { amount: 'XAF 25,000.00' }));
  await expect(lignes.nth(1)).toHaveText(bulu('X14', { amount: '25,500 FCFA' }));
  await expect(page.locator('#suivant')).toHaveText(bulu('F13'));
  expect(await nombres(page)).toEqual(avant);

  await page.click('#plus');
  await expect(lignes.nth(0)).toHaveText(bulu('X08', { amount: 'XAF 30,000.00' }));

  // Écran recréé en entier
  await page.click('#suivant');
  await expect(page.locator('h1')).toHaveText(bulu('C01'));
  await expect(lignes.nth(1)).toHaveText(bulu('X13', { amount: '25,000 FCFA', name: 'Awa Ndongo' }));
  await page.click('#retour');
  await expect(lignes.nth(0)).toHaveText(bulu('X08', { amount: 'XAF 30,000.00' }));
});
