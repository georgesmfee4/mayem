// Crée la clé de signature de l'équipe Mayem (une fois, puis à chaque rotation).
// Usage : npm run cle
// - la clé privée va dans ~/.mayem/cle-<id>.jwk, jamais dans le dépôt : la sauvegarder (gestionnaire de mots de
//   passe ou clé USB) ; qui la perd ne peut plus publier sous cette clé, qui la laisse fuiter doit la révoquer ;
// - la clé publique s'ajoute à packs/cles.json, comme clé active ; l'ancienne clé active devient « retiree » :
//   elle ne signe plus, mais ce qu'elle a signé reste valable.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ECDSA, idDeCle } from '../core/signature.ts';
import { dossierCles, fichierCles, lireCles } from './signature.js';

const paire = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
const privee = await crypto.subtle.exportKey('jwk', paire.privateKey);
const { kty, crv, x, y } = privee;
const id = await idDeCle(privee);

mkdirSync(dossierCles(), { recursive: true });
const chemin = join(dossierCles(), `cle-${id}.jwk`);
if (existsSync(chemin)) throw new Error(`${chemin} existe déjà`);
writeFileSync(chemin, JSON.stringify(privee) + '\n', { mode: 0o600 });

const cles = lireCles().map((c) => (c.statut === 'active' ? { ...c, statut: 'retiree' } : c));
cles.push({ id, jwk: { kty, crv, x, y }, statut: 'active', depuis: new Date().toISOString().slice(0, 10) });
writeFileSync(fichierCles(), JSON.stringify({ cles }, null, 2) + '\n');

console.log(`Clé ${id} créée.
  Clé privée : ${chemin}
    -> à sauvegarder maintenant hors de ce poste. Ne jamais la mettre dans le dépôt ni l'envoyer.
  Clé publique ajoutée à ${fichierCles()} (à commiter) : elle permet à chacun de vérifier nos signatures.`);
