// Script de fond. Mayem ne touche une page que lorsqu'on clique sur son icône :
// le clic donne accès à l'onglet en cours, et à lui seul (permission activeTab).
// Le pack est lu et vérifié ici, puis passé à la page : aucun fichier de l'extension n'est exposé aux sites.
// tools/compile.js regroupe ce fichier avec core/verifier.ts et core/empreinte.ts dans dom/fond.js.

import type { Pack } from '../core/types.ts';
import { empreinte } from '../core/empreinte.ts';
import { verifierPack } from '../core/verifier.ts';

declare const chrome: {
  runtime: {
    id: string;
    getURL(chemin: string): string;
    onMessage: { addListener(rappel: (message: unknown, expediteur: { id?: string; tab?: { id?: number } }, repondre: (r: unknown) => void) => boolean | void): void };
  };
  action: {
    onClicked: { addListener(rappel: (onglet: { id?: number }) => void): void };
    setBadgeText(o: { tabId: number; text: string }): Promise<void>;
    setBadgeBackgroundColor(o: { tabId: number; color: string }): Promise<void>;
    setTitle(o: { tabId: number; title: string }): Promise<void>;
  };
  scripting: {
    insertCSS(o: { target: Cible; files: string[] }): Promise<unknown>;
    executeScript(o: { target: Cible; files?: string[]; func?: (donnees: unknown) => void; args?: unknown[] }): Promise<unknown>;
  };
};
type Cible = { tabId: number; allFrames: boolean };
export interface Langue { langue: string; nom: string; version: string }

// Langues embarquées (tools/compile.js), la première par défaut
const SOMMAIRE = 'packs/index.json';
const SCHEMA = 'packs/schema.json';

const lire = (chemin: string) => fetch(chrome.runtime.getURL(chemin)).then((reponse) => reponse.json());

// Lu à chaque demande : le service worker peut être arrêté entre deux clics.
// Seul le pack de la langue demandée est lu : le coût ne dépend pas du nombre de langues.
type Verification = { pack: Pack; langues: Langue[]; erreurs: string[] } | { pack: null; langues: Langue[]; erreurs: string[] };

async function packVerifie(demandee?: string): Promise<Verification> {
  const [langues, schema] = await Promise.all([lire(SOMMAIRE), lire(SCHEMA)]) as [Langue[], never];
  const choisie = langues.find((l) => l.langue === demandee) || langues[0];
  const pack = await lire(`packs/${choisie.langue}/pack.json`);
  // Un pack modifié à la main dans dist/ n'a pas repassé check-pack : refusé. L'empreinte voit
  // même une modification qui garde les chiffres et les champs.
  const erreurs = verifierPack(pack, schema);
  if (!erreurs.length && (await empreinte(pack)) !== pack.empreinte) erreurs.push('empreinte différente : pack modifié après sa fabrication');
  if (erreurs.length) {
    console.error(`Mayem : pack ${choisie.langue} refusé, la page reste intacte.\n` + erreurs.join('\n'));
    return { pack: null, langues, erreurs };
  }
  return { pack, langues, erreurs: [] };
}

// Refus visible sur l'icône de l'onglet (badge « ! » et raison au survol) ; la page, elle, n'est pas touchée.
// Un titre vide rend celui du manifeste.
async function signaler(tabId: number, erreurs: string[]) {
  await chrome.action.setBadgeText({ tabId, text: erreurs.length ? '!' : '' });
  if (erreurs.length) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b42318' });
  await chrome.action.setTitle({ tabId, title: erreurs.length ? `Mayem : pack refusé, page laissée intacte.\n${erreurs[0]}` : '' });
}

async function injecter(onglet: { id?: number }) {
  if (onglet.id === undefined) return;
  const cible = { tabId: onglet.id, allFrames: true };
  try {
    const donnees = await packVerifie();
    await signaler(onglet.id, donnees.erreurs);
    if (!donnees.pack) return;
    await chrome.scripting.insertCSS({ target: cible, files: ['dom/style.css'] });
    await chrome.scripting.executeScript({
      target: cible,
      func: (lesDonnees) => {
        const { pack, langues } = lesDonnees as { pack: unknown; langues: unknown };
        Object.assign(globalThis, { mayemPack: pack, mayemLangues: langues });
      },
      args: [{ pack: donnees.pack, langues: donnees.langues }],
    });
    await chrome.scripting.executeScript({ target: cible, files: ['dom/contenu.js'] });
  } catch (erreur) {
    // Pages où aucune extension n'a le droit d'écrire (chrome://, boutique…) : rien à faire
    console.warn('Mayem :', erreur);
  }
}

// Changement de langue demandé par le panneau de Mayem. Seuls nos propres scripts peuvent écrire ici :
// le manifeste n'ouvre pas la messagerie aux sites (pas d'externally_connectable).
chrome.runtime.onMessage.addListener((message, expediteur, repondre) => {
  const demande = message as { mayemLangue?: string } | null;
  if (expediteur.id !== chrome.runtime.id || typeof demande?.mayemLangue !== 'string') return;
  packVerifie(demande.mayemLangue).then(async (donnees) => {
    if (expediteur.tab?.id !== undefined && donnees.erreurs.length) await signaler(expediteur.tab.id, donnees.erreurs);
    repondre(donnees.pack);
  }, () => repondre(null));
  return true; // réponse asynchrone
});

chrome.action.onClicked.addListener(injecter);
// Playwright ne sait pas cliquer sur l'icône : les tests (e2e/) appellent injecter depuis
// ce script de fond, que les sites ne voient pas
(globalThis as { mayemInjecter?: typeof injecter }).mayemInjecter = injecter;
