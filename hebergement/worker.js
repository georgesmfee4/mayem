// Devant les fichiers de l'API (Cloudflare Workers) : seuls les exports demandent une clé d'accès
// (en-tête X-Mayem-Cle) ; tout le reste est servi tel quel, sans rien lire ni garder des requêtes.
// Les chemins publics sont servis sans passer par ici (run_worker_first, wrangler.json) ; tout autre
// chemin, y compris un chemin encodé ou en majuscules qui viserait les exports, arrive ici et est
// décodé avant d'être jugé.
// Le KV ne garde que l'empreinte SHA-256 de chaque clé : une fuite du KV ne livre aucune clé.

export async function empreinteCle(cle) {
  const octets = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cle)));
  return [...octets].map((octet) => octet.toString(16).padStart(2, '0')).join('');
}

const FORME_CLE = /^[A-Za-z0-9_-]{32,128}$/;

function refus(statut, message) {
  return new Response(message + '\n', { status: statut, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

function protege(pathname) {
  let chemin;
  try {
    chemin = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // Mêmes règles qu'un serveur de fichiers : barres obliques inverses, segments vides, « . » et « .. »
  const segments = [];
  for (const segment of chemin.replace(/\\/g, '/').split('/')) {
    if (segment === '..') segments.pop();
    else if (segment && segment !== '.') segments.push(segment.toLowerCase());
  }
  return segments[0] === 'v1' && segments[1] === 'exports';
}

export default {
  async fetch(requete, env) {
    const juge = protege(new URL(requete.url).pathname);
    if (juge === null) return refus(400, 'Chemin mal formé.');
    if (!juge) return env.ASSETS.fetch(requete);
    if (requete.method !== 'GET' && requete.method !== 'HEAD') return refus(405, 'Lecture seule.');
    const cle = requete.headers.get('x-mayem-cle') || '';
    if (!FORME_CLE.test(cle) || !(await env.CLES_ACCES.get(await empreinteCle(cle)))) {
      return refus(401, 'Clé d\'accès absente ou inconnue : en-tête X-Mayem-Cle (voir docs/API.md).');
    }
    const reponse = await env.ASSETS.fetch(requete);
    const servie = new Response(reponse.body, reponse);
    servie.headers.set('cache-control', 'private, no-store');
    servie.headers.set('x-content-type-options', 'nosniff');
    return servie;
  },
};
