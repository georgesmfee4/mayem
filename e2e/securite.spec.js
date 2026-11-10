import { test, expect, ADRESSE } from './extension.js';

test.use({ copie: 'pack-modifie' });

test('pack modifié à la main : refusé, la page reste intacte', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'balises.html');
  const avant = await page.locator('body').innerHTML();
  await cliquer(page);
  await expect(page.locator('#mayem-host')).toHaveCount(0);
  expect(await page.locator('body').innerHTML()).toBe(avant);
});
