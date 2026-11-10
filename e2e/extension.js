// Lance Chromium avec l'extension et fournit cliquer(page), qui fait ce que fait le clic sur l'icône
import { test as base, chromium } from '@playwright/test';
import { join } from 'node:path';
import { DOSSIER } from './preparer.js';

export const ADRESSE = 'http://127.0.0.1:8765/fixtures/';

export const test = base.extend({
  copie: ['bonne', { option: true }],
  context: async ({ copie }, utiliser) => {
    const extension = join(DOSSIER, copie);
    const contexte = await chromium.launchPersistentContext('', {
      // Sous Windows, Edge déjà installé : rien à télécharger. Ailleurs, le Chromium de Playwright
      // (npx playwright install chromium). NAVIGATEUR=chromium ou msedge force le choix.
      channel: process.env.NAVIGATEUR || (process.platform === 'win32' ? 'msedge' : 'chromium'),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await utiliser(contexte);
    await contexte.close();
  },
  cliquer: async ({ context }, utiliser) => {
    const fond = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    await utiliser(async (page) => {
      await fond.evaluate(async (adresse) => {
        const [onglet] = await chrome.tabs.query({ url: adresse });
        await globalThis.mayemInjecter(onglet);
      }, page.url());
      await page.waitForTimeout(300); // l'observateur et les compteurs travaillent par images
    });
  },
});

export { expect } from '@playwright/test';
