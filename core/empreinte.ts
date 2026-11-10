// Empreinte SHA-256 d'un pack : tout le contenu sauf l'empreinte elle-même.
// Calculée par tools/build-pack.js, recalculée par l'extension à chaque clic et par quiconque
// télécharge le pack : la moindre modification après fabrication se voit, même sans chiffre changé.
// Web Crypto existe dans Node 22 comme dans les navigateurs.

import type { Pack } from './types.ts';

export async function empreinte(pack: Pack): Promise<string> {
  const contenu = JSON.stringify({ ...pack, empreinte: undefined });
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contenu));
  return 'sha256-' + [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}
