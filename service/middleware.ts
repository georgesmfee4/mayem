// Mayem en couche intermédiaire : une passerelle de canaux (USSD, application, web) lui envoie chaque tour de la
// personne en JSON ; Mayem le comprend avec le noyau, interroge la banque du service (service/banque-api.ts, avec
// l'identifiant du tour) et rend sa réponse, l'intention standard déclarée et l'état de l'opération. Tout ce qui est
// propre au service (adresse de la banque, intentions, états, langues) vient de son profil.
// La conversation est rattachée à l'empreinte du numéro, jamais au numéro en clair : une opération commencée sur un
// canal se poursuit sur un autre. Elle n'est gardée qu'en mémoire, le temps de la session.

import type { Contact } from '../core/comprendre.ts';
import { banqueApi, type ProfilBanque } from './banque-api.ts';
import { nouvelleSession, traiter, type Contexte, type Session, type Tour, type Transaction } from './conversation.ts';
import { ajuster } from './gsm7.ts';
import type { LigneJournal } from './journal.ts';
import { empreinteNumero, type Preferences } from './preferences.ts';

export interface ProfilMiddleware {
  banque: ProfilBanque;
  // Nom de la variable d'environnement qui porte la clé de l'équipe : la clé n'est jamais dans un fichier
  cle_env: string;
  devise: string;
  // Intention du noyau (ou « confirmer », « annuler », « corriger », « question », « inconnue ») -> intention standard
  intentions: Record<string, string>;
  statuts: Record<'aucune' | Transaction['etat'], string>;
  // Code de langue du service -> langue de Mayem
  langues: Record<string, string>;
}

interface TourRecu {
  trace_id: string;
  channel: string;
  phone: string;
  language: string | null;
  input?: { type?: string; text?: string };
  constraints?: { max_chars?: number };
}

interface Etat { session: Session; carnet?: Contact[]; langueRecue?: string | null; accueil: boolean; vu: number }

export interface OptionsMiddleware {
  ctx: Contexte;
  profil: ProfilMiddleware;
  cle: string;
  langueParDefaut: string;
  menu: { ref: string; demande: string }[];
  preferences: Preferences;
  noter: (ligne: LigneJournal) => void;
  appeler?: typeof fetch;
}

const DUREE_SESSION = 5 * 60_000;
const ARGENT = new Set(['transfert', 'credit', 'facture']);
const json = (corps: unknown) => new Response(JSON.stringify(corps), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function lireTour(brut: string): TourRecu | null {
  try {
    const t = JSON.parse(brut);
    return t && typeof t.trace_id === 'string' && typeof t.phone === 'string' && typeof t.channel === 'string' ? t : null;
  } catch { return null; }
}

// L'intention déclarée dit ce que Mayem a fait à ce tour : une question posée, une opération préparée, confirmée,
// annulée ou corrigée, ou la demande elle-même
function intentionDe(t: Tour, operation: string | undefined, table: Record<string, string>): string {
  const j = t.journal;
  const cle = j.intention === 'langue' ? 'langue'
    : j.statut === 'executee' ? 'confirmer'
      : j.statut === 'annulee' ? 'annuler'
        : j.validation.startsWith('corrigée') ? 'corriger'
          : j.statut === 'clarification' ? 'question'
            : j.statut === 'en_attente_confirmation' || j.statut === 'refusee' ? operation || j.intention || ''
              : j.intention || '';
  return table[cle] || table.inconnue;
}

function parametresDe(p: Record<string, unknown>, devise: string): Record<string, unknown> {
  return {
    ...(typeof p.montant === 'number' ? { amount: p.montant, currency: devise } : {}),
    ...(p.beneficiaire || p.telephone ? { beneficiary: p.beneficiaire || p.telephone } : {}),
    ...(typeof p.frais === 'number' ? { fee: p.frais } : {}),
    ...(typeof p.total === 'number' ? { total: p.total } : {}),
  };
}

export function creerMiddleware(o: OptionsMiddleware) {
  const etats = new Map<string, Etat>();
  const versService = Object.fromEntries(Object.entries(o.profil.langues).map(([leur, notre]) => [notre, leur]));

  async function etatDe(tour: TourRecu, cle: string): Promise<Etat> {
    const ancien = etats.get(cle);
    if (ancien && Date.now() - ancien.vu < DUREE_SESSION) return ancien;
    const langue = (await o.preferences.lire(tour.phone)) || o.langueParDefaut;
    const etat = { session: nouvelleSession(cle, tour.channel, langue), accueil: false, vu: Date.now() };
    etats.set(cle, etat);
    return etat;
  }

  // La langue envoyée par la passerelle vaut quand elle change ; entre-temps, celle que la personne a choisie en parlant
  function choisirLangue(etat: Etat, recue: string | null) {
    if (recue === etat.langueRecue) return;
    etat.langueRecue = recue;
    if (recue) etat.session.langue = o.profil.langues[recue] || 'fr';
  }

  async function accueil(ctx: Contexte, langue: string): Promise<string> {
    const client = await ctx.banque.client();
    return [ctx.reponses.rendre({ ref: 'RF001', valeurs: { name: client.prenom } }, langue, 'ussd').texte,
      ...o.menu.map((m, i) => ctx.reponses.rendre({ ref: m.ref, prefixe: `${i + 1}. ` }, langue, 'ussd').texte)].join('\n');
  }

  return async function tourDeCanal(requete: Request): Promise<Response> {
    const tour = lireTour(await requete.text());
    const p = o.profil;
    if (!tour) {
      return json({ response: { text: o.ctx.reponses.rendre({ ref: 'RF056' }, 'fr').texte, end_session: true, options: [] },
        interpretation: { intent: p.intentions.inconnue, parameters: {}, language: 'fr' }, transaction: { id: null, status: p.statuts.aucune } });
    }
    const cle = await empreinteNumero(tour.phone);
    const etat = await etatDe(tour, cle);
    const s = etat.session;
    s.canal = tour.channel;
    etat.vu = Date.now();
    choisirLangue(etat, tour.language ?? null);
    const brute = banqueApi({ profil: p.banque, cle: o.cle, trace: tour.trace_id, telephone: tour.phone, appeler: o.appeler });
    const ctx: Contexte = { ...o.ctx, banque: { ...brute, carnet: async () => (etat.carnet ??= await brute.carnet()) } };
    const ussd = tour.channel === 'ussd';
    let texte = (tour.input?.text || '').trim();

    // Un appel USSD qui commence : l'opération en attente s'il y en a une (commencée sur un autre canal), sinon le menu
    if (ussd && !texte) {
      const enAttente = s.attente ? s.derniere.map((m) => ctx.reponses.rendre(m, s.langue, 'ussd').texte).join('\n') : '';
      etat.accueil = !enAttente;
      const ecran = enAttente || await accueil(ctx, s.langue).catch(() => ctx.reponses.rendre({ ref: 'RF064' }, s.langue, 'ussd').texte);
      const tx = s.brouillon?.transaction;
      return json({ response: { text: ajuster(ecran, tour.constraints?.max_chars || 182), end_session: false, options: [] },
        interpretation: { intent: p.intentions[enAttente ? 'question' : 'inconnue'], parameters: {}, language: versService[s.langue] || s.langue },
        transaction: tx ? { id: tx, status: p.statuts.attente } : { id: null, status: p.statuts.aucune } });
    }
    if (ussd && etat.accueil && !s.attente && /^\d$/.test(texte)) texte = o.menu[Number(texte) - 1]?.demande || texte;
    etat.accueil = false;

    const avant = s.brouillon?.intention;
    const langueAvant = s.langue;
    let t: Tour;
    try {
      t = await traiter(ctx, s, texte);
    } catch {
      // Banque injoignable avant même de comprendre (carnet) : une réponse valide, rien n'est fait, et on le dit
      return json({ response: { text: ctx.reponses.rendre({ ref: 'RF064' }, s.langue, tour.channel).texte, end_session: ussd, options: [] },
        interpretation: { intent: p.intentions.inconnue, parameters: {}, language: versService[s.langue] || s.langue }, transaction: { id: null, status: p.statuts.aucune } });
    }
    if (s.langue !== langueAvant) await o.preferences.ecrire(tour.phone, s.langue);
    const j = t.journal;
    const reponse = ajuster(t.texte, tour.constraints?.max_chars || (ussd ? 182 : 2000));
    const operation = avant || s.brouillon?.intention || (ARGENT.has(j.intention || '') ? j.intention || undefined : undefined);
    const tx = t.transaction || (s.brouillon?.transaction ? { id: s.brouillon.transaction, etat: 'attente' as const } : null);
    const fin = ussd && (j.statut === 'executee' || j.intention === 'terminer' || (j.statut === 'annulee' && !/sans suite/.test(j.validation)));
    o.noter({ ...j, requete: texte, reponse });
    return json({
      response: { text: reponse, end_session: fin, options: [] },
      interpretation: { intent: intentionDe(t, operation, p.intentions), parameters: parametresDe(j.parametres || {}, p.devise), language: versService[s.langue] || s.langue },
      transaction: tx ? { id: tx.id, status: p.statuts[tx.etat] } : { id: null, status: p.statuts.aucune },
    });
  };
}
