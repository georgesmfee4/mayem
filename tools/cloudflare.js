// Appel de wrangler, l'outil de Cloudflare, à une version épinglée, par npx : il n'entre pas dans
// package.json ni dans l'extension (THIRD_PARTY.md). La connexion au compte (npx wrangler login) se fait
// par l'équipe Mayem elle-même.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { racine } from './langues.js';

export const WRANGLER = 'wrangler@4.157.0';
export const CONFIG = racine + 'hebergement/wrangler.json';
export const ADRESSE = racine + 'hebergement/adresse.txt';

// Cloudflare redirige un « + » du chemin (0.3.0+bum.0.8.2) vers « %2B » : règles, liens et lectures l'écrivent déjà ainsi
export const cheminEnLigne = (chemin) => chemin.replace(/\+/g, '%2B');

// Lancé par npm run, npx est à côté de npm : appelé par Node directement, sans interpréteur de commandes
// qui découperait les arguments ; sinon npx du système.
function npx() {
  const npm = process.env.npm_execpath || '';
  const voisin = npm.replace(/npm-cli\.js$/, 'npx-cli.js');
  if (voisin !== npm && existsSync(voisin)) return { programme: process.execPath, debut: [voisin], shell: false };
  return { programme: 'npx', debut: [], shell: process.platform === 'win32' };
}

export function wrangler(args, { afficher = true } = {}) {
  const { programme, debut, shell } = npx();
  const resultat = spawnSync(programme, [...debut, '--yes', WRANGLER, ...args, '--config', CONFIG], {
    cwd: racine, encoding: 'utf8', shell, stdio: afficher ? ['inherit', 'pipe', 'inherit'] : 'pipe',
  });
  if (afficher && resultat.stdout) process.stdout.write(resultat.stdout);
  return resultat;
}

// L'espace KV des clés d'accès doit exister (npx wrangler kv namespace create CLES_ACCES)
export function espaceCles() {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  const id = config.kv_namespaces.find((kv) => kv.binding === 'CLES_ACCES')?.id || '';
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Espace des clés d\'accès pas encore créé : hebergement/wrangler.json, kv_namespaces.');
  return id;
}
