import { test, expect, ADRESSE } from './extension.js';
import { nombres } from './donnees.js';

const PAGES = ['simple.html', 'balises.html', 'react.html', 'iframe.html', 'shadow.html', 'etroit.html'];
const compteur = (page) => page.locator('#mayem-host #n-deb');

test.describe('pseudo-langue', () => {
  test.use({ copie: 'pseudo' });

  test('textes allongés de 40 % : débordements signalés et entourés, valeurs intactes', async ({ page, cliquer }) => {
    await page.goto(ADRESSE + 'etroit.html');
    const avant = await nombres(page);
    await cliquer(page);
    await expect(page.locator('#continuer')).toHaveText(/^⟦Côñtíñúér .*⟧$/);
    for (const id of ['#continuer', '#total', '#libelle-montant', '#onglet-beneficiaire']) {
      await expect(page.locator(id)).toHaveAttribute('data-mayem-deborde', '');
    }
    await expect(page.locator('#retour')).not.toHaveAttribute('data-mayem-deborde');
    expect(await page.locator('#continuer').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
    expect(Number(await compteur(page).textContent())).toBeGreaterThanOrEqual(4);
    await expect(page.locator('#montant')).toHaveValue('25 000');
    expect(await nombres(page)).toEqual(avant);

    // L'original revient : plus aucun débordement compté
    await cliquer(page);
    await expect(page.locator('[data-mayem-deborde]')).toHaveCount(0);
  });
});

for (const [largeur, hauteur] of [[375, 812], [1280, 800]]) {
  test(`vrai bulu en ${largeur} px : aucun bouton critique ne déborde`, async ({ page, cliquer }) => {
    await page.setViewportSize({ width: largeur, height: hauteur });
    for (const nom of PAGES) {
      await page.goto(ADRESSE + nom);
      await cliquer(page);
      const critiques = await page.locator('button[data-mayem-critique][data-mayem-deborde], a[data-mayem-critique][data-mayem-deborde]').count();
      expect(critiques, `${nom} : bouton critique coupé`).toBe(0);
      const marques = await page.locator('[data-mayem-deborde]').count();
      await expect(compteur(page)).toHaveText(String(marques));
    }
  });
}
