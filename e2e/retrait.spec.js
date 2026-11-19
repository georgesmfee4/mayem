import { test, expect, ADRESSE } from './extension.js';
import { bulu } from './donnees.js';

test('extension supprimée du navigateur : la page ouverte redevient celle du service, sans bouton', async ({ page, cliquer, context }) => {
  await page.goto(ADRESSE + 'balises.html');
  await cliquer(page);
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
  await expect(page.locator('#mayem-host')).toHaveCount(1);

  // Le script de fond disparaît avec l'extension : l'appel peut ne jamais répondre
  const fond = context.serviceWorkers()[0];
  await fond.evaluate(() => chrome.management.uninstallSelf()).catch(() => {});

  await expect(page.locator('#mayem-host')).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
  await expect(page.locator('[data-mayem], [data-mayem-cat], [data-mayem-glose], [lang="bum"]')).toHaveCount(0);

  // Le service change un texte ensuite : plus rien ne le traduit
  await page.click('#changer');
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 30 000 FCFA');
});
