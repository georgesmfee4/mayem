import { test, expect, ADRESSE } from './extension.js';
import { bulu, nombres, terme } from './donnees.js';

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
  // Libellé qui est un terme validé du glossaire : traduit, la valeur ne bouge pas
  await expect(page.locator('#absent')).toHaveText(`${terme('T01')} : 5 000 FCFA`);
  expect(await page.locator('#absent b').textContent()).toBe('5 000 FCFA');
  // Phrase inconnue : reste en français, ses termes validés sont donnés à côté (CSS, hors du texte)
  await expect(page.locator('#inconnu')).toHaveAttribute('data-mayem-termes', new RegExp(`solde : ${terme('T01')}`));
  const glose = await page.locator('#inconnu').evaluate((el) => getComputedStyle(el, '::after').content);
  expect(glose).toContain(terme('T01'));
  await page.locator('#mayem-host #more').click();
  await page.locator('#mayem-host #gloses').uncheck();
  await expect(page.locator('#inconnu')).not.toHaveAttribute('data-mayem-termes');
  await page.locator('#mayem-host #gloses').check();
  await expect(page.locator('#inconnu')).toHaveAttribute('data-mayem-termes', /solde/);
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
