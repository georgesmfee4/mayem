// Mesure honnête de la compréhension : les phrases du test à l'aveugle (packs/<langue>/finale/test-recu.csv), écrites
// par une personne qui n'a vu aucune autre donnée, comparées à l'intention attendue (finale/test.csv).
//
//   npm run mesure [-- <langue>] [--provisoire]
//
// --provisoire : compte aussi les formulations pas encore signées de deux noms. Pour mesurer seulement : elles ne
// servent jamais en démonstration tant qu'elles ne sont pas validées.

import { existsSync, readFileSync } from 'node:fs';
import { comprendre } from '../core/comprendre.ts';
import { langueProbable, motsDe } from '../core/langue-probable.ts';
import { chargerContexte } from './conversation.js';
import { lireCsv } from './csv.js';
import { choisirLangue, dossier } from './langues.js';
import { option } from './options.js';

const args = process.argv.slice(2);
const provisoire = option(args, 'provisoire');
const code = choisirLangue(args[0]);
const lire = (nom) => lireCsv(readFileSync(dossier(code) + 'finale/' + nom, 'utf8'));
const ctx = chargerContexte(code, undefined, { provisoire });
const carnet = await ctx.banque.carnet();
const ignorer = new Set(carnet.flatMap((c) => motsDe(c.nom)));

// Un test : ses situations (intention attendue) et les phrases reçues. Une réponse fausse est comptée à part : une
// question vaut mieux qu'une erreur.
function mesurer(titre, situations, recues) {
  const attendu = Object.fromEntries(lire(situations).map((l) => [l.ref, l.intention]));
  const phrases = lire(recues);
  let justes = 0;
  const erreurs = [];
  for (const { ref, texte } of phrases) {
    const c = comprendre(texte, { lexiques: ctx.lexiques, carnet, termes: ctx.termes });
    const obtenu = c.intention || (c.hesitation.length ? `hésite (${c.hesitation.join(', ')})` : 'non comprise');
    if (obtenu === attendu[ref]) justes++;
    else erreurs.push({ fausse: Boolean(c.intention), ligne: `${ref}  attendu ${String(attendu[ref]).padEnd(10)} obtenu ${obtenu.padEnd(22)} « ${texte} »` });
  }
  const fausses = erreurs.filter((e) => e.fausse).length;
  console.log(`${titre}${provisoire ? ' (avec formulations provisoires)' : ''} : ${justes}/${phrases.length} intentions justes (${Math.round((100 * justes) / phrases.length)} %), ${fausses} fausse(s)`);
  // La langue, quand le canal ne la donne pas : reconnue aux mots propres du vocabulaire validé (core/langue-probable.ts)
  const langues = phrases.map(({ texte }) => langueProbable(texte, ctx.vocabulaires, { ignorer }));
  const reconnues = langues.filter((l) => l === code).length;
  const autres = langues.filter((l) => l && l !== code).length;
  console.log(`Langue reconnue sans être donnée : ${reconnues}/${phrases.length}, ${autres} prise(s) pour une autre langue, ${phrases.length - reconnues - autres} sans avis`);
  for (const e of erreurs) console.log('  ' + e.ligne);
}

mesurer('Test à l\'aveugle', 'test.csv', 'test-recu.csv');
// Second test : d'autres situations, écrites par une personne qui n'a vu aucun tableur ; la vraie mesure des progrès
if (existsSync(dossier(code) + 'finale/test-recu-2.csv')) mesurer('Second test à l\'aveugle', 'test-2.csv', 'test-recu-2.csv');
