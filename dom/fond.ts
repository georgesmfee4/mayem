// Script de fond. Mayem ne touche une page que lorsqu'on clique sur son icône :
// le clic donne accès à l'onglet en cours, et à lui seul (permission activeTab).
// Le pack est lu et vérifié ici, puis passé à la page : aucun fichier de l'extension n'est exposé aux sites.
// tools/compile.js regroupe ce fichier avec core/verifier.ts dans dom/fond.js.

import { verifierPack } from '../core/verifier.ts';

declare const chrome: {
  runtime: { getURL(chemin: string): string };
  action: { onClicked: { addListener(rappel: (onglet: { id?: number }) => void): void } };
  scripting: {
    insertCSS(o: { target: Cible; files: string[] }): Promise<unknown>;
    executeScript(o: { target: Cible; files?: string[]; func?: (pack: unknown) => void; args?: unknown[] }): Promise<unknown>;
  };
};
type Cible = { tabId: number; allFrames: boolean };

// Langues embarquées (tools/compile.js) : [{ langue, nom, version }], la première par défaut
const SOMMAIRE = 'packs/index.json';
const SCHEMA = 'packs/schema.json';

const lire = (chemin: string) => fetch(chrome.runtime.getURL(chemin)).then((reponse) => reponse.json());

async function injecter(onglet: { id?: number }) {
  if (onglet.id === undefined) return;
  const cible = { tabId: onglet.id, allFrames: true };
  try {
    // Lu à chaque clic : le service worker peut être arrêté entre deux clics.
    // Seul le pack de la langue choisie est lu : le coût ne dépend pas du nombre de langues.
    const [sommaire, schema] = await Promise.all([lire(SOMMAIRE), lire(SCHEMA)]);
    const pack = await lire(`packs/${sommaire[0].langue}/pack.json`);
    // Un pack modifié à la main dans dist/ n'a pas repassé check-pack : on ne l'injecte pas
    const erreurs = verifierPack(pack, schema);
    if (erreurs.length) {
      console.error('Mayem : pack refusé, la page reste intacte.\n' + erreurs.join('\n'));
      return;
    }
    await chrome.scripting.insertCSS({ target: cible, files: ['dom/style.css'] });
    await chrome.scripting.executeScript({
      target: cible,
      func: (lePack) => { (globalThis as { mayemPack?: unknown }).mayemPack = lePack; },
      args: [pack],
    });
    await chrome.scripting.executeScript({ target: cible, files: ['dom/contenu.js'] });
  } catch (erreur) {
    // Pages où aucune extension n'a le droit d'écrire (chrome://, boutique…) : rien à faire
    console.warn('Mayem :', erreur);
  }
}

chrome.action.onClicked.addListener(injecter);
// Playwright ne sait pas cliquer sur l'icône : les tests (e2e/) appellent injecter depuis
// ce script de fond, que les sites ne voient pas
(globalThis as { mayemInjecter?: typeof injecter }).mayemInjecter = injecter;
