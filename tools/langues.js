// Une langue = un dossier packs/<code>/ avec infos.json. Aucun outil ne connaît de langue par son nom :
// ajouter une langue ne demande que des données.

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const racine = fileURLToPath(new URL('..', import.meta.url));

// Dossiers des langues : packs/ du dépôt, ou celui de MAYEM_PACKS (langue d'essai des tests, langue
// préparée hors du dépôt). Le schéma, lui, reste celui du dépôt : c'est le contrat.
const dossierPacks = resolve(process.env.MAYEM_PACKS || join(racine, 'packs')) + sep;

export const langues = () =>
  readdirSync(dossierPacks, { withFileTypes: true })
    .filter((entree) => entree.isDirectory() && existsSync(`${dossierPacks}${entree.name}/infos.json`))
    .map((entree) => entree.name)
    .sort();

export const dossier = (langue) => `${dossierPacks}${langue}/`;

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
