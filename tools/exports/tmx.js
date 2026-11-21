// TMX 1.4 : mémoire de traduction lue par les outils de traduction (OmegaT, Trados…) et les moteurs.
// Une unité par phrase validée par deux relecteurs de l'équipe Mayem ; aucun nom de personne.

import { echapperXml as x, entete, mentionDroits, validees } from './commun.js';

const prop = (type, valeur) => (valeur ? `\n      <prop type="${type}">${x(valeur)}</prop>` : '');
const variante = (langue, texte) => `\n      <tuv xml:lang="${langue}"><seg>${x(texte)}</seg></tuv>`;

export function versTmx(pack) {
  const unites = validees(pack).map((p) => `    <tu tuid="${x(p.id)}">`
    + prop('x-retraduction', p.retraduction) + prop('x-critique', p.critique ? 'oui' : 'non')
    + variante('fr', p.fr) + (p.en[0] ? variante('en', p.en[0]) : '') + variante(pack.langue, p.cible)
    + '\n    </tu>');
  return entete
    + '<tmx version="1.4">\n'
    + `  <header creationtool="Mayem" creationtoolversion="${x(pack.version)}" segtype="sentence" o-tmf="Mayem" adminlang="fr" srclang="fr" datatype="plaintext">\n`
    + `    <prop type="x-droits">${x(mentionDroits(pack))}</prop>\n  </header>\n`
    + `  <body>\n${unites.join('\n')}\n  </body>\n</tmx>\n`;
}
