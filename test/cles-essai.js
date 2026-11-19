// Clé d'essai pour les tests : jamais celle de l'équipe, créée puis oubliée à chaque test
import { ECDSA, idDeCle } from '../core/signature.ts';

export async function nouvelleCle(statut = 'active') {
  const paire = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', paire.publicKey);
  const id = await idDeCle(jwk);
  return { cle: { id, privee: paire.privateKey }, publique: { id, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, statut }, paire };
}
