// Interface publique du moteur Mayem : ce que d'autres projets peuvent appeler (docs/API.md).
// Tout est pur : une chaîne et un pack en entrée, un résultat en sortie ; ni DOM, ni réseau.
// tools/compile.js en fait dist-lib/mayem-core.js, un module ES sans dépendance.

import { traduire, etiquette, categoriser, normaliser } from './moteur.ts';
import { repartir } from './repartir.ts';
import { verifierPack } from './verifier.ts';
import { controler } from './controle.ts';
import { empreinte } from './empreinte.ts';
import { queDesFaits, memesChiffres } from './faits.ts';
import { termesConnus, traduireTerme } from './termes.ts';
import { inventorier, masquerFaits } from './inventaire.ts';

export {
  traduire, etiquette, categoriser, normaliser, repartir, verifierPack, controler, empreinte, queDesFaits, memesChiffres,
  termesConnus, traduireTerme, inventorier, masquerFaits,
};
