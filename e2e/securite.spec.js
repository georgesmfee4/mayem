import { test, expect, ADRESSE } from './extension.js';

// Badge et info-bulle de l'icône pour l'onglet de la page, lus dans le script de fond
async function icone(context, page) {
  const fond = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  return fond.evaluate(async (adresse) => {
    const [onglet] = await chrome.tabs.query({ url: adresse });
    return { badge: await chrome.action.getBadgeText({ tabId: onglet.id }), titre: await chrome.action.getTitle({ tabId: onglet.id }) };
  }, page.url());
}

for (const [copie, raison] of [['pack-modifie', /les chiffres du bulu diffèrent/], ['mot-change', /empreinte différente/]]) {
  test.describe(copie, () => {
    test.use({ copie });

    test(`pack modifié (${copie}) : refusé, badge « ! » sur l'icône, page intacte`, async ({ page, context, cliquer }) => {
      await page.goto(ADRESSE + 'balises.html');
      const avant = await page.locator('body').innerHTML();
      await cliquer(page);
      await expect(page.locator('#mayem-host')).toHaveCount(0);
      expect(await page.locator('body').innerHTML()).toBe(avant);
      const { badge, titre } = await icone(context, page);
      expect(badge).toBe('!');
      expect(titre).toMatch(/pack refusé, page laissée intacte/);
      expect(titre).toMatch(raison);
    });
  });
}

test('bon pack : aucun badge', async ({ page, context, cliquer }) => {
  await page.goto(ADRESSE + 'balises.html');
  await cliquer(page);
  await expect(page.locator('#mayem-host')).toHaveCount(1);
  expect((await icone(context, page)).badge).toBe('');
});
