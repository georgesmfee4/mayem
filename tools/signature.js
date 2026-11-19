// Côté équipe : la clé privée qui signe ce que publie l'API. Elle vit hors du dépôt, sur le poste de la
// personne qui publie (et dans sa sauvegarde) ; le dépôt ne garde que les clés publiques (packs/cles.json).
// MAYEM_CLE_PRIVEE : chemin du fichier de clé ; sinon ~/.mayem/cle-<id>.jwk de la clé active.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ECDSA, SIGNER, idDeCle, versBase64 } from '../core/signature.ts';
import { racine } from './langues.js';

export const dossierCles = () => join(homedir(), '.mayem');
export const fichierCles = () => process.env.MAYEM_CLES || join(racine, 'packs', 'cles.json');
export const lireCles = () => (existsSync(fichierCles()) ? JSON.parse(readFileSync(fichierCles(), 'utf8')).cles : []);

// Clé privée de l'équipe, refusée si sa partie publique n'est pas une clé active de packs/cles.json :
// une signature que personne ne pourrait vérifier ne sert à rien
export async function chargerCle() {
  const active = lireCles().find((c) => c.statut === 'active');
  const chemin = process.env.MAYEM_CLE_PRIVEE || (active && join(dossierCles(), `cle-${active.id}.jwk`));
  if (!chemin || !existsSync(chemin)) {
    throw new Error('Clé de signature introuvable. Une seule fois : npm run cle (la clé privée reste hors du dépôt, à sauvegarder).');
  }
  const jwk = JSON.parse(readFileSync(chemin, 'utf8'));
  const id = await idDeCle(jwk);
  const connue = lireCles().find((c) => c.id === id);
  if (!connue || connue.statut !== 'active') throw new Error(`La clé ${id} n'est pas une clé active de ${fichierCles()}.`);
  const privee = await crypto.subtle.importKey('jwk', jwk, ECDSA, false, ['sign']);
  return { id, privee };
}

export async function signerOctets(octets, cle) {
  const signature = new Uint8Array(await crypto.subtle.sign(SIGNER, cle.privee, octets));
  return { cle: cle.id, valeur: versBase64(signature) };
}

// L'empreinte doit déjà être juste : c'est elle qui est signée
export async function signerPack(pack, cle) {
  const { signature: _ancienne, ...sans } = pack;
  return { ...sans, signature: await signerOctets(new TextEncoder().encode(pack.empreinte), cle) };
}
