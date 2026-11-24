// La couche intermédiaire de Mayem en ligne (Cloudflare). Chaque tour d'une passerelle de canaux arrive ici
// (POST /v1/middleware) et part à l'objet durable du numéro, rangé sous son empreinte : la conversation en cours et la
// langue choisie y sont gardées d'un tour à l'autre, quelle que soit la machine qui reçoit la requête, jamais avec le
// numéro en clair. Les données (pack public, réponses, vocabulaires, profil) sont embarquées par
// tools/deployer-passerelle.js : aucun fichier lu, aucun nom de traducteur. La clé de l'équipe est un secret
// Cloudflare, au nom que donne le profil. Aucun journal n'est gardé en ligne.

import { DurableObject } from 'cloudflare:workers';
import donnees from './donnees.json';
import { contexteDepuis } from '../../service/contexte.ts';
import { creerMiddleware } from '../../service/middleware.ts';
import { empreinteNumero } from '../../service/preferences.ts';

const TAILLE_MAX = 64 * 1024;
const DUREE_SESSION = 5 * 60_000;
const json = (corps, statut = 200) => new Response(JSON.stringify(corps), {
  status: statut, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// Chaque tour reçoit la banque du service décrite par le profil : le contexte n'en porte aucune
let contexte;
const contexteEmbarque = () => (contexte ??= contexteDepuis(donnees.contexte, null));

export class Conversation extends DurableObject {
  middleware() {
    const stockage = this.ctx.storage;
    const { profil } = donnees;
    this.tour ??= creerMiddleware({
      ctx: contexteEmbarque(), profil: profil.middleware, cle: this.env[profil.middleware.cle_env] || '',
      langueParDefaut: profil.langue || 'fr', langues: donnees.langues, menu: profil.ussd?.menu || [],
      // Cet objet est celui d'un seul numéro : langue et conversation y sont rangées sans le numéro
      preferences: { lire: async () => (await stockage.get('langue')) || null, ecrire: async (_, code) => { await stockage.put('langue', code); } },
      etats: { lire: async () => stockage.get('etat'), ecrire: async (_, etat) => { await stockage.put('etat', etat); } },
      noter: () => {},
    });
    return this.tour;
  }

  async fetch(requete) {
    const reponse = await this.middleware()(requete);
    // La conversation ne survit pas à la session : effacée cinq minutes après le dernier tour ; seule la langue reste
    await this.ctx.storage.setAlarm(Date.now() + DUREE_SESSION);
    return reponse;
  }

  async alarm() {
    await this.ctx.storage.delete('etat');
  }
}

export default {
  async fetch(requete, env) {
    const url = new URL(requete.url);
    if (requete.method === 'GET' && url.pathname === '/sante') {
      return json({ service: 'Mayem', mode: 'couche intermédiaire', profil: donnees.profil.nom, pack: donnees.contexte.pack.version, langues: donnees.langues });
    }
    if (requete.method !== 'POST' || url.pathname !== '/v1/middleware') return json({ erreur: 'adresse inconnue' }, 404);
    const corps = await requete.text();
    if (corps.length > TAILLE_MAX) return json({ erreur: 'trop grand' }, 413);
    let telephone = '';
    try { telephone = String(JSON.parse(corps).phone || ''); } catch { /* tour mal formé : la couche répond quand même */ }
    const objet = env.CONVERSATIONS.get(env.CONVERSATIONS.idFromName(telephone ? await empreinteNumero(telephone) : 'sans-numero'));
    return objet.fetch(new Request(requete.url, { method: 'POST', body: corps, headers: { 'content-type': 'application/json' } }));
  },
};
