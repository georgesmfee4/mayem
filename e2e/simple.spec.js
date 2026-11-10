import { test, expect, ADRESSE } from './extension.js';
import { bulu, nombres } from './donnees.js';

test('page HTML simple : parcours jusqu au récapitulatif sans toucher aux valeurs', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'simple.html');
  const avant = await nombres(page);
  await cliquer(page);
  await expect(page.locator('h2')).toHaveText(bulu('X01'));
  expect(await nombres(page)).toEqual(avant);

  await page.getByRole('button', { name: bulu('X09') }).click();
  await page.fill('#phone', '690 00 00 00');
  await page.fill('#amount', '5000');
  await page.getByRole('button', { name: bulu('F13') }).click();
  await expect(page.locator('h2')).toHaveText(bulu('X28'));
  await expect(page.locator('#app')).toContainText('5 000 FCFA');
  await expect(page.locator('#app')).toContainText('Jean Mballa');
  await expect(page.locator('#app')).toContainText('690 00 00 00');
});
