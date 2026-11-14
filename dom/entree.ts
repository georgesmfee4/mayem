// Point d'entrée, injecté par dom/fond.ts à chaque clic sur l'icône.
// Le pack et la liste des langues sont déjà posés dans globalThis (mayemPack, mayemLangues) :
// la page ne voit aucun fichier de l'extension.
// tools/compile.js regroupe ce fichier avec core/ et dom/ dans dom/contenu.js.

import type { Pack } from '../core/types.ts';
import { arreter, demarrer, inverser } from './page.ts';
import type { Langue } from './interface.ts';

// Le script de fond sert le pack vérifié d'une autre langue (dom/fond.ts)
declare const chrome: { runtime: { id?: string; sendMessage(message: unknown): Promise<unknown> } };
const demanderAuFond = (code: string) => chrome.runtime.sendMessage({ mayemLangue: code }) as Promise<Pack | null>;

// false pour la démo et l'usage réel : seules les traductions validées par deux locuteurs s'affichent.
// true pendant la traduction : un texte pas encore validé apparaît « ‹…› + français ».
const MODE_TEST = false;

// Chaque injection crée une nouvelle copie de ce code : seule la première démarre,
// les suivantes appellent la bascule qu'elle a laissée
const etat = globalThis as { mayemPack?: Pack; mayemLangues?: Langue[]; mayemInverser?: () => void };

// Une extension supprimée, désactivée ou rechargée laisse ce script dans les pages déjà ouvertes,
// et le navigateur ne le prévient pas : il ne lui reste que son identifiant, qui disparaît.
function installee(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

// Extension partie : la page est rendue au service, et un nouveau clic repartira de zéro
function veiller() {
  if (installee()) return;
  clearInterval(veille);
  document.removeEventListener('visibilitychange', veiller);
  arreter();
  delete etat.mayemInverser;
  delete etat.mayemPack;
}
let veille: ReturnType<typeof setInterval>;

if (etat.mayemInverser) {
  etat.mayemInverser();
} else if (etat.mayemPack) {
  etat.mayemInverser = inverser;
  demarrer(etat.mayemPack, { test: MODE_TEST }, etat.mayemLangues || [], { chargerPack: demanderAuFond });
  veille = setInterval(veiller, 2000);
  document.addEventListener('visibilitychange', veiller);
}
