import { test, expect, ADRESSE } from './extension.js';
import { bulu, nombres } from './donnees.js';

test('sens reconnu : même sens que le corpus, autres mots -> traduction validée ; un mot qui change le sens -> original', async ({ page, cliquer }) => {
  await page.goto(ADRESSE + 'sens.html');
  const avant = await nombres(page);
  await cliquer(page);

  // Reformulations : la traduction validée de la phrase de même sens, signalée par un pointillé
  await expect(page.locator('#reformule')).toHaveText(bulu('C02'));
  await expect(page.locator('#reformule')).toHaveAttribute('data-mayem-sens', 'reconnu');
  expect(await page.locator('#reformule').evaluate((el) => getComputedStyle(el).textDecorationStyle)).toBe('dotted');
  await expect(page.locator('#balises')).toHaveText(bulu('R01'));
  await expect(page.locator('#majuscules')).toHaveText(bulu('C01'));
  // La valeur reste dans sa balise, intacte
  await expect(page.locator('#code')).toHaveText(bulu('X26', { code: '4821' }));
  expect(await page.locator('#code b').textContent()).toBe('4821');
  // Shadow DOM et texte ajouté plus tard par le service
  await expect(page.locator('#ombre p')).toHaveText(bulu('X22'));
  await expect(page.locator('#tardif')).toHaveText(bulu('X17'));

  // Pièges : négation, temps, personne. L'original reste, jamais la traduction d'une phrase voisine
  await expect(page.locator('#negation')).toHaveText("Votre virement n'a pas été envoyé.");
  await expect(page.locator('#temps')).toHaveText('Votre virement sera envoyé.');
  await expect(page.locator('#personne')).toHaveText('Vérifiez le nom et le numéro du destinataire.');
  for (const id of ['#negation', '#temps', '#personne']) await expect(page.locator(id)).not.toHaveAttribute('data-mayem-sens');

  // Le panneau compte à part les textes traduits par le sens reconnu
  await page.locator('#mayem-host #more').click();
  await expect(page.locator('#mayem-host #n-sens')).toHaveText('6');
  expect(await nombres(page)).toEqual(avant);

  // Retour à l'original : la page du service, sans aucune marque
  await cliquer(page);
  await expect(page.locator('#reformule')).toHaveText('Votre virement a bien été envoyé.');
  await expect(page.locator('[data-mayem-sens]')).toHaveCount(0);
});
