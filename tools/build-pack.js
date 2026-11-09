// corpus.csv + glossaire.csv + packs/bum/infos.json -> packs/bum/pack.json
// Usage : node tools/build-pack.js
// Le pack n'est écrit que s'il passe check-pack : un pack invalide ne remplace jamais le bon.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lireCsv } from './csv.js';
import { verifierPack } from './check-pack.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(racine + chemin, 'utf8');
const oui = (v) => ['1', 'oui', 'yes', 'x'].includes((v || '').trim().toLowerCase());

// tools/kit.py écrit « Traducteur / relu par Relecteur » dans la colonne valide_par
function personnes(validePar) {
  const [traduit_par = '', relu_par = ''] = (validePar || '').split(/\s*\/\s*relu par\s*/i);
  return { traduit_par: traduit_par.trim(), relu_par: relu_par.trim() };
}

function versPhrase(ligne) {
  return {
    id: ligne.id.trim(),
    fr: ligne.fr.trim(),
    en: (ligne.en || '').split('|').map((e) => e.trim()).filter(Boolean),
    bulu: (ligne.bulu || '').trim(),
    critique: ligne.critique.trim() === '1',
    ...personnes(ligne.valide_par),
    valide: oui(ligne.valide),
  };
}

// Les lignes sans référence sont des titres de section du tableur
function versTerme(ligne) {
  const cellule = (debut) => (Object.entries(ligne).find(([nom]) => nom.startsWith(debut))?.[1] || '').trim();
  return {
    ref: cellule('Réf'),
    terme: cellule('Catégorie'),
    sens: cellule('Texte français'),
    en: cellule('Anglais'),
    bulu: cellule('TRADUCTION BULU'),
    critique: cellule('Critique').toLowerCase() === 'oui',
    a_eviter: cellule('Mots à éviter'),
    traduit_par: cellule('Traduit par'),
    relu_par: cellule('Relu par'),
    commentaire: cellule('Commentaire'),
  };
}

const pack = {
  ...JSON.parse(lire('packs/bum/infos.json')),
  glossaire: lireCsv(lire('glossaire.csv')).map(versTerme).filter((t) => t.ref),
  phrases: lireCsv(lire('corpus.csv')).map(versPhrase),
};

const erreurs = verifierPack(pack);
if (erreurs.length) {
  console.error(erreurs.join('\n'));
  console.error('Pack non écrit.');
  process.exit(1);
}
writeFileSync(racine + 'packs/bum/pack.json', JSON.stringify(pack, null, 2) + '\n');
const validees = pack.phrases.filter((p) => p.valide).length;
console.log(`${pack.phrases.length} phrases (${validees} validées), ${pack.glossaire.length} termes -> packs/bum/pack.json`);
