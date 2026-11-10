// Une langue = un dossier packs/<code>/ avec infos.json. Aucun outil ne connaît de langue par son nom :
// ajouter une langue ne demande que des données.

import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const racine = fileURLToPath(new URL('..', import.meta.url));

export const langues = () =>
  readdirSync(racine + 'packs', { withFileTypes: true })
    .filter((entree) => entree.isDirectory() && existsSync(`${racine}packs/${entree.name}/infos.json`))
    .map((entree) => entree.name)
    .sort();

export const dossier = (langue) => `${racine}packs/${langue}/`;

// Langue demandée, ou la seule présente. Arrête le programme si le choix est impossible.
export function choisirLangue(demandee) {
  const presentes = langues();
  if (demandee && presentes.includes(demandee)) return demandee;
  if (!demandee && presentes.length === 1) return presentes[0];
  console.error(demandee
    ? `Langue inconnue : ${demandee}. Présentes : ${presentes.join(', ') || 'aucune'}`
    : `Plusieurs langues (${presentes.join(', ')}) : préciser laquelle, par exemple npm run pack -- ${presentes[0]}`);
  process.exit(1);
}

// Argument de ligne de commande : un fichier .json, ou un code de langue
export const cheminPack = (argument) =>
  argument && argument.endsWith('.json') ? argument : dossier(choisirLangue(argument)) + 'pack.json';
