// Lecture d'un CSV (guillemets, retours à la ligne dans une cellule, BOM d'Excel).
// Rend une liste d'objets dont les clés sont les en-têtes de la première ligne.

export function lireCsv(texte) {
  const lignes = decouper(texte.replace(/^﻿/, ''));
  const entetes = lignes.shift() || [];
  return lignes
    .filter((cellules) => cellules.some((c) => c.trim()))
    .map((cellules) => Object.fromEntries(entetes.map((nom, i) => [nom, cellules[i] ?? ''])));
}

function decouper(texte) {
  const lignes = [];
  let ligne = [];
  let cellule = '';
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else cellule += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === ',') { ligne.push(cellule); cellule = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = '';
    } else cellule += c;
  }
  if (cellule || ligne.length) lignes.push([...ligne, cellule]);
  return lignes;
}

// Écriture : guillemets quand une cellule contient une virgule, un guillemet ou un retour à la ligne.
// BOM et fins de ligne Windows, pour qu'Excel lise les accents.
const cellule = (valeur) => {
  const texte = String(valeur ?? '');
  return /[",\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
};
export const ecrireCsv = (entetes, lignes) =>
  '\uFEFF' + [entetes, ...lignes.map((ligne) => entetes.map((nom) => ligne[nom]))].map((cellules) => cellules.map(cellule).join(',')).join('\r\n') + '\r\n';
