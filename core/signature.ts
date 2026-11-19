// Signature de l'équipe Mayem : ECDSA P-256, gérée par Web Crypto dans Node comme dans les navigateurs.
// L'empreinte dit « rien n'a changé depuis la fabrication » ; la signature dit « c'est bien l'équipe Mayem
// qui l'a fabriqué ». Quiconque contrôle un serveur peut recalculer une empreinte, pas imiter une signature
// sans la clé privée, qui ne quitte jamais l'équipe. Sert à qui récupère un pack ou un script sur l'API.

import { empreinte } from './empreinte.ts';
import type { Pack } from './types.ts';

export interface Signature { cle: string; valeur: string }
// retiree : ne signe plus, ses signatures restent valables ; revoquee : compromise, plus rien ne vaut
export interface ClePublique { id: string; jwk: JsonWebKey; statut: 'active' | 'retiree' | 'revoquee'; depuis?: string }

export const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
export const SIGNER = { name: 'ECDSA', hash: 'SHA-256' };

export const versBase64 = (octets: Uint8Array): string =>
  btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function depuisBase64(texte: string): Uint8Array {
  const normal = texte.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normal + '='.repeat((4 - (normal.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

// Identifiant d'une clé : début du SHA-256 de sa partie publique, écrite toujours de la même façon
export async function idDeCle(jwk: JsonWebKey): Promise<string> {
  const publique = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const octets = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publique)));
  return [...octets.slice(0, 8)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// Rend la raison du refus, ou null si la signature est d'une clé de confiance et correspond aux octets
export async function verifierOctets(octets: Uint8Array, signature: Signature | undefined, cles: ClePublique[]): Promise<string | null> {
  if (!signature?.cle || !signature.valeur) return 'non signé';
  const cle = cles.find((c) => c.id === signature.cle);
  if (!cle) return `clé inconnue ${signature.cle}`;
  if (cle.statut === 'revoquee') return `clé révoquée ${cle.id}`;
  if (await idDeCle(cle.jwk) !== cle.id) return `clé ${cle.id} : identifiant faux`;
  const { kty, crv, x, y } = cle.jwk;
  const publique = await crypto.subtle.importKey('jwk', { kty, crv, x, y }, ECDSA, false, ['verify']);
  const bonne = await crypto.subtle.verify(SIGNER, publique, depuisBase64(signature.valeur), octets);
  return bonne ? null : 'signature fausse';
}

// Liste des erreurs ; vide si le pack est intact et signé par une clé de confiance
export async function verifierSignature(pack: Pack, cles: ClePublique[]): Promise<string[]> {
  if (await empreinte(pack) !== pack.empreinte) return ['empreinte différente : le pack a été modifié'];
  const raison = await verifierOctets(new TextEncoder().encode(pack.empreinte), pack.signature, cles);
  return raison ? [`signature : ${raison}`] : [];
}
