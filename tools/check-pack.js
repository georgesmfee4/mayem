// Refuse un pack de langue invalide.
// Usage : node tools/check-pack.js [packs/bum/pack.json]
// Contrôle la forme (packs/schema.json), puis les règles qui protègent l'utilisateur :
// mêmes champs {…} et mêmes chiffres en français et en bulu, deux personnes pour valider.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const schema = JSON.parse(readFileSync(racine + 'packs/schema.json', 'utf8'));

const champs = (s) => (s.match(/\{\w+\}/g) || []).sort();
const chiffres = (s) => (s.match(/\d+/g) || []).sort().join('|');
const typeDe = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

// Sous-ensemble de JSON Schema suffisant pour notre schéma : type, required, properties, items
function verifierForme(valeur, regle, chemin, erreurs) {
  if (regle.type && typeDe(valeur) !== regle.type) {
    erreurs.push(`${chemin} : attendu ${regle.type}, trouvé ${typeDe(valeur)}`);
    return;
  }
  for (const nom of regle.required || []) {
    if (!(nom in valeur)) erreurs.push(`${chemin} : champ « ${nom} » manquant`);
  }
  for (const [nom, sousRegle] of Object.entries(regle.properties || {})) {
    if (valeur && nom in valeur) verifierForme(valeur[nom], sousRegle, `${chemin}.${nom}`, erreurs);
  }
  if (regle.items && Array.isArray(valeur)) {
    valeur.forEach((element, i) => verifierForme(element, regle.items, `${chemin}[${i}]`, erreurs));
  }
}

function verifierPhrase(p, erreurs) {
  const id = p.id || '(sans id)';
  const fr = champs(p.fr).join();
  if (new Set(champs(p.fr)).size !== champs(p.fr).length) erreurs.push(`${id} : champ {…} en double dans le français`);
  for (const en of p.en) {
    if (champs(en).join() !== fr) erreurs.push(`${id} : les champs {…} de l'anglais diffèrent du français`);
  }
  if (p.bulu) {
    if (champs(p.bulu).join() !== fr) erreurs.push(`${id} : les champs {…} du bulu diffèrent du français`);
    if (chiffres(p.bulu) !== chiffres(p.fr)) erreurs.push(`${id} : les chiffres du bulu diffèrent du français`);
  }
  // Le traducteur connaît le français : sa retraduction ne prouverait rien
  if (p.retraduit_par.trim() && p.retraduit_par.trim().toLowerCase() === p.traduit_par.trim().toLowerCase()) {
    erreurs.push(`${id} : retraduite par la personne qui l'a traduite`);
  }
  if (!p.valide) return;
  if (!p.bulu) erreurs.push(`${id} : validée mais sans traduction bulu`);
  if (!p.relu_par.trim()) erreurs.push(`${id} : validée sans relecteur`);
  else if (p.relu_par.trim().toLowerCase() === p.traduit_par.trim().toLowerCase()) {
    erreurs.push(`${id} : relue par la personne qui l'a traduite`);
  }
}

// Rend la liste des erreurs ; vide si le pack est bon
export function verifierPack(pack) {
  const erreurs = [];
  verifierForme(pack, schema, 'pack', erreurs);
  if (erreurs.length) return erreurs; // inutile d'aller plus loin sur un pack mal formé

  const ids = new Set();
  for (const p of pack.phrases) {
    if (ids.has(p.id)) erreurs.push(`${p.id} : id en double`);
    ids.add(p.id);
    verifierPhrase(p, erreurs);
  }
  for (const [categorie, id] of Object.entries(pack.etiquettes)) {
    if (!ids.has(id)) erreurs.push(`étiquette « ${categorie} » : la phrase ${id} n'existe pas`);
  }
  return erreurs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fichier = process.argv[2] || racine + 'packs/bum/pack.json';
  const erreurs = verifierPack(JSON.parse(readFileSync(fichier, 'utf8')));
  if (erreurs.length) {
    console.error(erreurs.join('\n'));
    process.exit(1);
  }
  console.log(`${fichier} : pack valide`);
}
