// Script de fond. Mayem ne touche une page que lorsqu'on clique sur son icône :
// le clic donne accès à l'onglet en cours, et à lui seul (permission activeTab).
// Le pack est lu ici puis passé à la page : aucun fichier de l'extension n'est exposé aux sites.

declare const chrome: {
  runtime: { getURL(chemin: string): string };
  action: { onClicked: { addListener(rappel: (onglet: { id?: number }) => void): void } };
  scripting: {
    insertCSS(o: { target: Cible; files: string[] }): Promise<unknown>;
    executeScript(o: { target: Cible; files?: string[]; func?: (pack: unknown) => void; args?: unknown[] }): Promise<unknown>;
  };
};
type Cible = { tabId: number; allFrames: boolean };

const PACK = 'packs/bum/pack.json';

chrome.action.onClicked.addListener(async (onglet) => {
  if (onglet.id === undefined) return;
  const cible = { tabId: onglet.id, allFrames: true };
  try {
    // Lu à chaque clic : le service worker peut être arrêté entre deux clics
    const pack = await fetch(chrome.runtime.getURL(PACK)).then((reponse) => reponse.json());
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
});
