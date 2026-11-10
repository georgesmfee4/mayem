import { test, expect, ADRESSE } from './extension.js';
import { bulu, nombres } from './donnees.js';

test('texte coupé par des balises et messages de plusieurs phrases', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'balises.html');
  const avant = await nombres(page);
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 25 000 FCFA');
  await expect(page.locator('#mayem-host')).toHaveCount(0); // rien avant le clic

  await cliquer(page);
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '25 000 FCFA' }));
  await expect(page.locator('#envoi')).toHaveText(bulu('X13', { amount: '25 000 FCFA', name: 'Awa Ndongo' }));
  expect(await page.locator('#envoi strong').evaluate((el) => el.textContent)).toBe('25 000 FCFA');
  await expect(page.locator('#message')).toHaveText(`${bulu('A04')} ${bulu('S02')}`);
  await expect(page.locator('#inconnu')).toContainText('Cette phrase ne figure dans aucun corpus.');
  await expect(page.locator('#inconnu')).toHaveAttribute('data-mayem', 'non_verifie');
  await expect(page.locator('#absent')).toHaveText('Solde : 5 000 FCFA');
  await expect(page.locator('#montant')).toHaveValue('5 000');
  expect(await nombres(page)).toEqual(avant);

  // Le service change le montant : le bloc est retraduit
  await page.click('#changer');
  await expect(page.locator('#solde')).toHaveText(bulu('X08', { amount: '30 000 FCFA' }));

  // Deuxième clic : l'original revient
  await cliquer(page);
  await expect(page.locator('#solde')).toHaveText('Votre solde est de 30 000 FCFA');
  await expect(page.locator('#mayem-host')).toHaveCount(1);
});

test('une seule langue embarquée : pas de liste de langues', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'balises.html');
  await cliquer(page);
  await expect(page.locator('#mayem-host #toggle')).toHaveText('Bulu ⇄ original');
  await expect(page.locator('#mayem-host select')).toBeHidden();
});
