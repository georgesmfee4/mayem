import { test, expect, ADRESSE } from './extension.js';
import { bulu } from './donnees.js';

test('formulaire dans un cadre : traduit, un seul bouton qui bascule aussi le cadre', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'iframe.html');
  const cadre = page.frameLocator('#cadre');
  await expect(cadre.locator('h2')).toHaveText('Frais de transfert');

  await cliquer(page);
  await expect(page.locator('body > p')).toHaveText(bulu('A04'));
  await expect(cadre.locator('h2')).toHaveText(bulu('F01'));
  await expect(cadre.locator('p').nth(1)).toHaveText(bulu('X12', { amount: '150 FCFA' }));
  await expect(cadre.locator('#montant')).toHaveValue('10 000');
  await expect(page.locator('#mayem-host')).toHaveCount(1);
  await expect(cadre.locator('#mayem-host')).toHaveCount(0);

  await page.locator('#mayem-host #toggle').click();
  await expect(cadre.locator('h2')).toHaveText('Frais de transfert');
  await expect(page.locator('body > p')).toHaveText('Consultez votre solde et lancez un transfert en toute sécurité.');
});
