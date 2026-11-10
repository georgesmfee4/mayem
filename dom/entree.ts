// Point d'entrée, injecté par dom/fond.ts à chaque clic sur l'icône.
// Le pack et la liste des langues sont déjà posés dans globalThis (mayemPack, mayemLangues) :
// la page ne voit aucun fichier de l'extension.
// tools/compile.js regroupe ce fichier avec core/ et dom/ dans dom/contenu.js.

import type { Pack } from '../core/types.ts';
import { demarrer, inverser } from './page.ts';
import type { Langue } from './interface.ts';

// false pour la démo et l'usage réel : seules les traductions validées par deux locuteurs s'affichent.
// true pendant la traduction : un texte pas encore validé apparaît « ‹…› + français ».
const MODE_TEST = false;

// Chaque injection crée une nouvelle copie de ce code : seule la première démarre,
// les suivantes appellent la bascule qu'elle a laissée
const etat = globalThis as { mayemPack?: Pack; mayemLangues?: Langue[]; mayemInverser?: () => void };
if (etat.mayemInverser) {
  etat.mayemInverser();
} else if (etat.mayemPack) {
  etat.mayemInverser = inverser;
  demarrer(etat.mayemPack, { test: MODE_TEST }, etat.mayemLangues || []);
}
