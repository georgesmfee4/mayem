// Sert les pages d'essai (fixtures/) en local, sans dépendance
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (requete, reponse) => {
  const chemin = normalize(decodeURIComponent(new URL(requete.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
  if (!chemin.startsWith('fixtures')) return reponse.writeHead(404).end();
  try {
    const contenu = await readFile(racine + chemin);
    reponse.writeHead(200, { 'content-type': TYPES[extname(chemin)] || 'application/octet-stream' }).end(contenu);
  } catch {
    reponse.writeHead(404).end();
  }
}).listen(8765, '127.0.0.1');
