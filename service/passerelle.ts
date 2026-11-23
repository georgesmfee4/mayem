// La passerelle Mayem : la couche d'API qu'on branche devant un service financier existant, sans toucher à son code.
// Écrite avec Request et Response, les standards du web : elle tourne dans Node comme chez un hébergeur (Cloudflare).
//
//   GET  /sante                      état de la passerelle (langue, version du pack, modes branchés)
//   POST /v1/converser               une demande en langage courant -> réponse du noyau conversationnel
//   POST /v1/traduire                des textes du service -> traduits s'ils sont validés, sinon inchangés
//   POST /v1/ussd                    adresse à donner à l'opérateur USSD (relais du service, ou conversation)
//   *    /v1/relais/api/<chemin>     relais de l'API du service (application mobile, web) : réponses JSON traduites
//   GET  /v1/journal?depuis=<n>      lignes du journal, aux colonnes du tableau de bord du jury
//   GET  /tableau                    tableau de bord en direct

import { empreinteOperation, type Operation } from '../core/operation.ts';
import type { Pack } from '../core/types.ts';
import { nouvelleSession, traiter, type Contexte, type Session } from './conversation.ts';
import type { LigneJournal } from './journal.ts';
import { traduireJson, traduireTexte, type Bilan } from './traduction.ts';
import { converserUssd, ecrireUssd, lireUssd, relayer, type ProfilUssd, type Relais } from './ussd.ts';

export interface Profil {
  nom: string;
  // Langue affichée par défaut : 'fr' ou le code d'une langue nationale
  langue?: string;
  api?: {
    base: string;
    proteges?: string[];
    // Appels de l'API qui portent une opération : seuls le montant et le numéro en sont lus, pour son empreinte
    operations?: { chemin: string; intention: Operation['intention']; statut: 'en_attente_confirmation' | 'executee' }[];
  };
  ussd?: ProfilUssd;
}

export interface Options {
  ctx: Contexte;
  pack: Pack;
  profil: Profil;
  appeler?: typeof fetch;
  pages?: Record<string, string>;
}

export interface LigneDatee extends LigneJournal { numero: number; heure: string }

const TAILLE_MAX = 64 * 1024;
const LIGNES_GARDEES = 500;
const SESSIONS_GARDEES = 2000;
// Ce que le relais de l'API transmet au service : rien qui touche à la connexion entre la passerelle et lui
const ENTETES_RETIRES = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'x-mayem-langue', 'x-mayem-canal']);

const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), {
  status: statut, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
});
const erreur = (message: string, statut: number) => json({ erreur: message }, statut);

async function lireCorps(requete: Request): Promise<string> {
  if (Number(requete.headers.get('content-length') || 0) > TAILLE_MAX) throw new RangeError('trop grand');
  const texte = await requete.text();
  if (texte.length > TAILLE_MAX) throw new RangeError('trop grand');
  return texte;
}

function garder<K, V>(table: Map<K, V>, cle: K, valeur: V) {
  table.set(cle, valeur);
  if (table.size > SESSIONS_GARDEES) table.delete(table.keys().next().value as K);
}

export function creerPasserelle({ ctx, pack, profil, appeler = fetch, pages = {} }: Options) {
  const journal: LigneDatee[] = [];
  let numero = 0;
  const sessions = new Map<string, Session>();
  const relais: Relais = { pack, ctx, profil: profil.ussd || {}, appeler, etats: new Map(), langueParDefaut: profil.langue || 'fr' };
  const langueDe = (demandee: string | null) => (demandee === 'fr' || demandee === pack.langue ? demandee : profil.langue || 'fr');

  function noter(ligne: LigneJournal) {
    journal.push({ ...ligne, numero: ++numero, heure: new Date().toISOString(), temps_ms: Math.round(ligne.temps_ms * 10) / 10 });
    if (journal.length > LIGNES_GARDEES) journal.shift();
  }

  async function converser(requete: Request) {
    const corps = JSON.parse(await lireCorps(requete));
    if (typeof corps.texte !== 'string' || !corps.texte.trim() || corps.texte.length > 500) return erreur('texte attendu (500 signes au plus)', 400);
    const canal = typeof corps.canal === 'string' ? corps.canal.slice(0, 20) : 'web';
    const id = typeof corps.session === 'string' && corps.session ? corps.session.slice(0, 80) : crypto.randomUUID();
    const cle = `${canal}:${id}`;
    const session = sessions.get(cle) || nouvelleSession(id, canal, langueDe(corps.langue ?? null));
    garder(sessions, cle, session);
    const tour = await traiter(ctx, session, corps.texte);
    noter(tour.journal);
    return json({ session: id, langue: session.langue, reponse: tour.texte, rendus: tour.rendus, journal: tour.journal });
  }

  async function traduireTextes(requete: Request) {
    const corps = JSON.parse(await lireCorps(requete));
    const textes: unknown = corps.textes ?? (typeof corps.texte === 'string' ? [corps.texte] : null);
    if (!Array.isArray(textes) || !textes.every((t) => typeof t === 'string')) return erreur('textes attendus : une liste de chaînes', 400);
    const langue = langueDe(corps.langue ?? null);
    const bilan: Bilan = { traduits: 0, conserves: 0 };
    return json({ langue, textes: textes.map((t) => (langue === 'fr' ? t : traduireTexte(t, pack, bilan))), bilan });
  }

  async function ussd(requete: Request) {
    const entree = lireUssd(new URLSearchParams(await lireCorps(requete)));
    if (!entree.session) return new Response('END Session absente', { status: 400 });
    const sortie = profil.ussd?.service
      ? await relayer(relais, entree)
      : await converserUssd(ctx, profil.ussd || {}, sessions, entree, profil.langue || 'fr');
    noter(sortie.journal);
    return new Response(ecrireUssd(sortie), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }

  // L'opération portée par un appel de l'API (profil) : même forme, donc même empreinte, que sur les autres canaux
  async function operationApi(chemin: string, corps: string | undefined, reussi: boolean) {
    const regle = profil.api?.operations?.find((o) => o.chemin === chemin);
    if (!regle || !corps) return null;
    let valeurs: { montant?: unknown; telephone?: unknown };
    try { valeurs = JSON.parse(corps); } catch { return null; }
    const montant = Number(valeurs.montant);
    const telephone = String(valeurs.telephone ?? '');
    if (!(montant > 0) || !/^6\d{8}$/.test(telephone)) return null;
    const operation: Operation = { intention: regle.intention, montant, telephone };
    return { operation, empreinte: await empreinteOperation(operation), statut: reussi ? regle.statut : 'refusee' as const };
  }

  async function relaisApi(requete: Request, chemin: string, recherche: string) {
    if (!profil.api?.base) return erreur('aucune API de service dans le profil', 404);
    const debut = performance.now();
    const entetes = new Headers([...requete.headers].filter(([nom]) => !ENTETES_RETIRES.has(nom.toLowerCase())));
    const avecCorps = !['GET', 'HEAD'].includes(requete.method);
    const corps = avecCorps ? await lireCorps(requete) : undefined;
    const reponse = await appeler(`${profil.api.base.replace(/\/$/, '')}/${chemin}${recherche}`, { method: requete.method, headers: entetes, body: corps });
    const suivi = await operationApi(chemin, corps, reponse.ok);
    const langue = langueDe(requete.headers.get('x-mayem-langue') || new URL(requete.url).searchParams.get('langue'));
    const type = reponse.headers.get('content-type') || '';
    if (langue === 'fr' || !type.includes('json')) return new Response(reponse.body, { status: reponse.status, headers: { 'content-type': type } });
    const bilan: Bilan = { traduits: 0, conserves: 0 };
    const traduit = traduireJson(await reponse.json(), pack, new Set(profil.api.proteges || []), bilan);
    noter({
      equipe: 'Mayem', session: '', canal: requete.headers.get('x-mayem-canal') || 'mobile', langue, requete: `${requete.method} /${chemin}`,
      intention: suivi?.operation.intention || 'traduction', raison: 'réponse du service traduite',
      parametres: { statut_service: reponse.status, ...bilan, ...(suivi ? { montant: suivi.operation.montant, telephone: suivi.operation.telephone } : {}) },
      reponse: '', reponses: [], statut: suivi?.statut || 'information', validation: `${bilan.traduits} texte(s) traduit(s), ${bilan.conserves} laissé(s) tels quels`,
      operation: suivi?.operation || null, empreinte: suivi?.empreinte || null, temps_ms: performance.now() - debut, erreurs: [],
    });
    return new Response(JSON.stringify(traduit), {
      status: reponse.status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-mayem': `langue=${langue}; traduits=${bilan.traduits}; conserves=${bilan.conserves}` },
    });
  }

  async function aiguiller(requete: Request): Promise<Response> {
    const url = new URL(requete.url);
    const route = `${requete.method} ${url.pathname}`;
    if (route === 'GET /sante') {
      return json({ service: 'Mayem', profil: profil.nom, langue: pack.langue, nom: pack.nom, pack: pack.version, ussd: profil.ussd?.service ? 'relais' : 'conversation', api: Boolean(profil.api?.base) });
    }
    if (route === 'POST /v1/converser') return converser(requete);
    if (route === 'POST /v1/traduire') return traduireTextes(requete);
    if (route === 'POST /v1/ussd') return ussd(requete);
    if (route === 'GET /v1/journal') return json({ lignes: journal.filter((l) => l.numero > Number(url.searchParams.get('depuis') || 0)) });
    if (route === 'GET /tableau' && pages.tableau) return new Response(pages.tableau, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    const relaye = url.pathname.match(/^\/v1\/relais\/api\/(.*)$/);
    if (relaye) {
      // Le choix de langue est pour la passerelle : le service ne le reçoit pas
      const recherche = new URLSearchParams(url.search);
      recherche.delete('langue');
      return relaisApi(requete, relaye[1], recherche.size ? `?${recherche}` : '');
    }
    return erreur('adresse inconnue', 404);
  }

  return {
    journal,
    async traiter(requete: Request): Promise<Response> {
      try {
        return await aiguiller(requete);
      } catch (e) {
        if (e instanceof SyntaxError) return erreur('JSON invalide', 400);
        if (e instanceof RangeError) return erreur('requête trop grande', 413);
        // Le service relayé ne répond pas, ou panne interne : la cause va au journal du serveur, pas à l'utilisateur
        console.error(e);
        return erreur('service indisponible', 502);
      }
    },
  };
}
