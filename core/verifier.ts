// Refuse un pack de langue invalide. Utilisé à la fabrication du pack (tools/check-pack.js)
// et par l'extension avant chaque entrée dans une page (dom/fond.ts).
// Contrôle la forme (packs/schema.json), puis les règles qui protègent l'utilisateur :
// mêmes champs {…} et mêmes chiffres en français et en bulu, deux personnes pour valider.

import type { Pack, Phrase } from './types.ts';

// Sous-ensemble de JSON Schema suffisant pour notre schéma : type, required, properties, items
export interface Regle {
  type?: string;
  required?: string[];
  properties?: Record<string, Regle>;
  items?: Regle;
}

const champs = (s: string) => (s.match(/\{\w+\}/g) || []).sort();
const chiffres = (s: string) => (s.match(/\d+/g) || []).sort().join('|');
const typeDe = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const memePersonne = (a: string, b: string) => a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase();

function verifierForme(valeur: any, regle: Regle, chemin: string, erreurs: string[]) {
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
    const items = regle.items;
    valeur.forEach((element, i) => verifierForme(element, items, `${chemin}[${i}]`, erreurs));
  }
}

function verifierPhrase(p: Phrase, erreurs: string[]) {
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
  if (memePersonne(p.retraduit_par, p.traduit_par)) erreurs.push(`${id} : retraduite par la personne qui l'a traduite`);
  if (!p.valide) return;
  if (!p.bulu) erreurs.push(`${id} : validée mais sans traduction bulu`);
  if (!p.relu_par.trim()) erreurs.push(`${id} : validée sans relecteur`);
  else if (memePersonne(p.relu_par, p.traduit_par)) erreurs.push(`${id} : relue par la personne qui l'a traduite`);
}

// Rend la liste des erreurs ; vide si le pack est bon
export function verifierPack(pack: unknown, schema: Regle): string[] {
  const erreurs: string[] = [];
  verifierForme(pack, schema, 'pack', erreurs);
  if (erreurs.length) return erreurs; // inutile d'aller plus loin sur un pack mal formé

  const { phrases, glossaire, etiquettes } = pack as Pack;
  const ids = new Set<string>();
  for (const p of phrases) {
    if (ids.has(p.id)) erreurs.push(`${p.id} : id en double`);
    ids.add(p.id);
    verifierPhrase(p, erreurs);
  }
  const termes = new Set(glossaire.filter((t) => t.bulu.trim()).map((t) => t.ref));
  for (const [categorie, id] of Object.entries(etiquettes)) {
    if (!ids.has(id as string) && !termes.has(id as string)) erreurs.push(`étiquette « ${categorie} » : ni phrase ni terme traduit ${id}`);
  }
  return erreurs;
}
