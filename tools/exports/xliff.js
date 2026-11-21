// XLIFF 1.2 : format d'échange des outils de traduction et des chaînes de localisation.
// Les phrases sont « approuvées » : validées par deux relecteurs de l'équipe Mayem ; aucun nom de personne.

import { echapperXml as x, entete, mentionDroits, validees } from './commun.js';

export function versXliff(pack) {
  const unites = validees(pack).map((p) => `      <trans-unit id="${x(p.id)}" approved="yes">\n`
    + `        <source>${x(p.fr)}</source>\n`
    + `        <target state="final">${x(p.cible)}</target>\n`
    + `        <note>Validé par deux relecteurs de l'équipe Mayem${p.critique ? ' ; texte critique (argent ou sécurité)' : ''}</note>\n`
    + '      </trans-unit>');
  return entete
    + '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">\n'
    + `  <file source-language="fr" target-language="${x(pack.langue)}" datatype="plaintext" original="mayem-${x(pack.langue)}-${x(pack.version)}">\n`
    + `    <header><note>${x(mentionDroits(pack))}</note></header>\n`
    + `    <body>\n${unites.join('\n')}\n    </body>\n  </file>\n</xliff>\n`;
}
