// Mesure du niveau 3 (sens reconnu) sur le jeu d'essai : paraphrases reconnues, pièges écartés, par catégorie.
// Usage : npm run sens [-- <langue>]. Les chiffres vont au dossier de preuves ; les tests (test/sens.test.js)
// échouent, eux, au premier faux rapprochement.

import { readFileSync } from 'node:fs';
import { traduire } from '../core/moteur.ts';
import { cheminPack } from './langues.js';
import { AUTRE_PHRASE_JUSTE, HORS_PORTEE, PARAPHRASES, pieges } from '../test/sens-donnees.js';

const pack = JSON.parse(readFileSync(cheminPack(process.argv[2]), 'utf8'));
const critiques = new Set(pack.phrases.filter((p) => p.critique).map((p) => p.id));
const reconnuComme = (texte) => {
  const r = traduire(texte, pack);
  return r?.statut === 'ok' ? r.id : null;
};

const trouvees = PARAPHRASES.filter(([texte, id]) => reconnuComme(texte) === id);
const liste = pieges(pack);
const parChange = new Map();
let faux = 0;
let fauxCritiques = 0;
for (const [texte, change, interdit] of liste) {
  const cle = change.replace(/, sans accents$/, '');
  const ligne = parChange.get(cle) || { pieges: 0, faux: 0 };
  const r = traduire(texte, pack);
  const fautif = r?.sens === 'reconnu' && r.statut === 'ok' && AUTRE_PHRASE_JUSTE.get(texte) !== r.id;
  ligne.pieges++;
  if (fautif) {
    ligne.faux++;
    faux++;
    if (critiques.has(interdit)) fauxCritiques++;
    console.log(`FAUX RAPPROCHEMENT (${change}) : « ${texte} » -> ${r.id}`);
  }
  parChange.set(cle, ligne);
}

const pourcent = (a, b) => `${Math.round((100 * a) / b)} %`;
console.log(`Pack ${pack.nom} ${pack.version}`);
console.log(`Paraphrases reconnues : ${trouvees.length} / ${PARAPHRASES.length} (${pourcent(trouvees.length, PARAPHRASES.length)})`);
console.log(`Hors de portée sans paraphrase vérifiée : ${HORS_PORTEE.length}, dont ${HORS_PORTEE.filter(([texte, id]) => reconnuComme(texte) && reconnuComme(texte) !== id).length} avec une autre traduction`);
console.log(`Pièges : ${liste.length}, faux rapprochements : ${faux} (dont ${fauxCritiques} sur des phrases critiques)`);
for (const [change, ligne] of [...parChange].sort((a, b) => b[1].pieges - a[1].pieges)) {
  console.log(`  ${change.padEnd(18)} ${String(ligne.pieges).padStart(4)} pièges, ${ligne.faux} faux`);
}
if (faux) process.exit(1);
