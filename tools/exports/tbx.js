// TBX (ISO 30042:2019, TBX-Basic) : glossaire terminologique, un concept par terme.
// Le terme approuvé est « preferred » ; « mots à éviter » est souvent une explication : il devient une note.

import { echapperXml as x, entete, mentionDroits, termesTraduits } from './commun.js';

const formes = (champ) => champ.split('/').map((f) => f.trim()).filter(Boolean);

const terme = (texte, note = '') => '          <termSec>\n'
  + `            <term>${x(texte)}</term>\n`
  + '            <termNote type="administrativeStatus">preferredTerm-admn-sts</termNote>\n'
  + (note ? `            <note>À éviter : ${x(note)}</note>\n` : '')
  + '          </termSec>';

function concept(t, langue) {
  const definition = t.sens ? `\n          <descrip type="definition">${x(t.sens)}</descrip>` : '';
  const francais = formes(t.terme).map((f) => terme(f)).join('\n');
  const traduits = formes(t.cible).map((f, i) => terme(f, i === 0 ? t.a_eviter : '')).join('\n');
  return `      <conceptEntry id="${x(t.ref)}">\n`
    + `        <langSec xml:lang="fr">${definition}\n${francais}\n        </langSec>\n`
    + `        <langSec xml:lang="${x(langue)}">\n${traduits}\n        </langSec>\n`
    + '      </conceptEntry>';
}

export function versTbx(pack) {
  return entete
    + '<tbx type="TBX-Basic" style="dca" xml:lang="fr" xmlns="urn:iso:std:iso:30042:ed-2">\n'
    + `  <tbxHeader>\n    <fileDesc>\n      <sourceDesc><p>Glossaire Mayem ${x(pack.nom)} (${x(pack.langue)}) ${x(pack.version)}</p></sourceDesc>\n      <publicationStmt><p>${x(mentionDroits(pack))}</p></publicationStmt>\n    </fileDesc>\n  </tbxHeader>\n`
    + `  <text>\n    <body>\n${termesTraduits(pack).map((t) => concept(t, pack.langue)).join('\n')}\n    </body>\n  </text>\n</tbx>\n`;
}
