import { test, expect, ADRESSE } from './extension.js';
import { bulu } from './donnees.js';

test('composants à Shadow DOM ouvert, dont un ajouté après le clic', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'shadow.html');
  await cliquer(page); // le composant #tardif n'existe pas encore
  for (const id of ['#ouvert', '#tardif']) {
    await expect(page.locator(`${id} h2`)).toHaveText(bulu('A05'));
    await expect(page.locator(`${id} p`).first()).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
    await expect(page.locator(`${id} button`)).toHaveAttribute('title', bulu('A09'));
    // Message inconnu : original gardé, étiquette affichée par le style adopté
    const alerte = page.locator(`${id} p`).nth(1);
    await expect(alerte).toHaveAttribute('data-mayem-cat', /./);
    expect(await alerte.evaluate((el) => getComputedStyle(el, '::before').content)).toContain(' · ');
  }
});
