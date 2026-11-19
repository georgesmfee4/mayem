// Clé d'accès d'un client aux exports et jeux de données de l'API en ligne.
// Usage : npm run cle-acces -- <client>              crée une clé, affichée une seule fois
//         npm run cle-acces -- --retirer <empreinte>  la retire, refusée en une minute au plus, sans redéployer
//         (sous PowerShell aussi : npm run cle-acces -- retirer <empreinte>)
// Seule l'empreinte SHA-256 de la clé va dans l'espace KV de Cloudflare : la clé ne se retrouve nulle part.

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { empreinteCle } from '../hebergement/worker.js';
import { espaceCles, wrangler } from './cloudflare.js';
import { valeur } from './options.js';

export const nouvelleCleAcces = () => randomBytes(32).toString('base64url');

async function creer(client) {
  if (!/^[\w.-]{1,40}$/.test(client || '')) throw new Error('Nom du client : lettres, chiffres, point, tiret, 40 signes au plus.');
  const cle = nouvelleCleAcces();
  const empreinte = await empreinteCle(cle);
  const envoi = wrangler(['kv', 'key', 'put', '--binding', 'CLES_ACCES', '--remote', empreinte, `${client}/${new Date().toISOString().slice(0, 10)}`], { afficher: false });
  if (envoi.status !== 0) throw new Error(`Clé non enregistrée : ${envoi.stderr || envoi.stdout}`);
  console.log(`Clé d'accès de ${client}, à transmettre par un canal sûr ; elle ne sera plus affichée :\n\n  ${cle}\n`);
  console.log(`En-tête à envoyer : X-Mayem-Cle. Pour la retirer : npm run cle-acces -- --retirer ${empreinte}`);
}

function retirer(empreinte) {
  if (!/^[0-9a-f]{64}$/.test(empreinte || '')) throw new Error('Empreinte attendue : 64 caractères hexadécimaux.');
  const envoi = wrangler(['kv', 'key', 'delete', '--binding', 'CLES_ACCES', '--remote', empreinte], { afficher: false });
  if (envoi.status !== 0) throw new Error(`Clé non retirée : ${envoi.stderr || envoi.stdout}`);
  console.log('Clé retirée : refusée partout en une minute au plus (délai de Cloudflare).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    espaceCles();
    const args = process.argv.slice(2);
    const empreinte = valeur(args, 'retirer');
    if (empreinte !== undefined) retirer(empreinte);
    else await creer(args[0]);
  } catch (erreur) {
    console.error(erreur.message);
    process.exit(1);
  }
}
