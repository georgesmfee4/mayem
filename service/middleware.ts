// Mayem en couche intermédiaire : une passerelle de canaux (USSD, application, web) lui envoie chaque tour de la
// personne en JSON ; Mayem le comprend avec le noyau, interroge la banque du service (service/banque-api.ts, avec
// l'identifiant du tour) et rend sa réponse, l'intention standard déclarée et l'état de l'opération. Tout ce qui est
// propre au service (adresse de la banque, intentions, états, langues) vient de son profil.
// La conversation est rattachée à l'empreinte du numéro, jamais au numéro en clair : une opération commencée sur un
// canal se poursuit sur un autre. Elle n'est gardée qu'en mémoire, le temps de la session. Sans langue donnée par
// la passerelle, Mayem la reconnaît aux mots de la demande (core/langue-probable.ts), ou la demande au premier appel USSD.

import type { Contact } from '../core/comprendre.ts';
import { langueProbable, motsDe } from '../core/langue-probable.ts';
import { banqueApi, type ProfilBanque } from './banque-api.ts';
import { ecranDeChoix, langueChoisie, type Langue } from './choix-langue.ts';
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

// decidee : la langue a été donnée, choisie ou reconnue dans cette conversation ; choix : l'écran de choix est affiché ;
// accueil : le menu est affiché, une touche y choisit une ligne
export interface Etat { session: Session; carnet?: Contact[]; langueRecue?: string | null; decidee: boolean; choix: boolean; accueil: boolean; vu: number }

// Où la conversation est gardée d'un tour à l'autre : en mémoire ici, dans un stockage durable chez un hébergeur
// dont deux requêtes peuvent arriver sur deux machines (Cloudflare). L'état est écrit à la fin de chaque tour.
export interface Memoire { lire(cle: string): Promise<Etat | undefined>; ecrire(cle: string, etat: Etat): Promise<void> }

const SESSIONS_GARDEES = 2000;
export function memoireLocale(): Memoire {
  const etats = new Map<string, Etat>();
  return {
    lire: async (cle) => etats.get(cle),
    async ecrire(cle, etat) {
      etats.set(cle, etat);
      if (etats.size > SESSIONS_GARDEES) etats.delete(etats.keys().next().value as string);
    },
  };
}

export interface OptionsMiddleware {
  ctx: Contexte;
  profil: ProfilMiddleware;
  cle: string;
  langueParDefaut: string;
  // Langues prises en charge, chacune sous son propre nom (écran de choix)
  langues: Langue[];
  menu: { ref: string; demande: string }[];
  preferences: Preferences;
  etats?: Memoire;
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
function cleIntention(t: Tour, operation: string | undefined): string {
  const j = t.journal;
  return (j.intention === 'langue' ? 'langue'
    : j.statut === 'executee' ? 'confirmer'
      : j.statut === 'annulee' ? 'annuler'
        : j.validation.startsWith('corrigée') ? 'corriger'
          : j.statut === 'clarification' ? 'question'
            : j.statut === 'en_attente_confirmation' || j.statut === 'refusee' ? operation || j.intention
              : j.intention) || 'inconnue';
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
  const memoire = o.etats || memoireLocale();
  const p = o.profil;
  const versService = Object.fromEntries(Object.entries(p.langues).map(([leur, notre]) => [notre, leur]));

  // Corps de réponse au contrat du profil
  const corps = (s: Session, texte: string, cle: string, extra: { fin?: boolean; parametres?: Record<string, unknown>; tx?: Transaction | null } = {}) => ({
    response: { text: texte, end_session: extra.fin || false, options: [] },
    interpretation: { intent: p.intentions[cle] || cle, parameters: extra.parametres || {}, language: versService[s.langue] || s.langue },
    transaction: extra.tx ? { id: extra.tx.id, status: p.statuts[extra.tx.etat] } : { id: null, status: p.statuts.aucune },
  });

  async function etatDe(tour: TourRecu, cle: string): Promise<Etat> {
    const ancien = await memoire.lire(cle);
    if (ancien && Date.now() - ancien.vu < DUREE_SESSION) return ancien;
    const langue = (await o.preferences.lire(tour.phone)) || o.langueParDefaut;
    return { session: nouvelleSession(cle, tour.channel, langue), decidee: false, choix: false, accueil: false, vu: Date.now() };
  }

  // La langue envoyée par la passerelle vaut quand elle change ; entre-temps, celle que la personne a choisie en parlant
  function langueRecue(etat: Etat, recue: string | null) {
    if (recue === (etat.langueRecue ?? null)) return;
    etat.langueRecue = recue;
    if (recue) { etat.session.langue = p.langues[recue] || 'fr'; etat.decidee = true; }
  }

  // Sans langue donnée par la passerelle, celle des mots de la demande : au début de la conversation, un mot propre à
  // une langue suffit ; ensuite il en faut deux, et aucun d'une autre langue (un « oui » glissé ne change rien)
  async function reconnaitre(etat: Etat, ctx: Contexte, texte: string) {
    if (etat.langueRecue || !o.ctx.vocabulaires || !/\p{L}/u.test(texte)) return;
    const ignorer = new Set((await ctx.banque.carnet().catch(() => [])).flatMap((c) => motsDe(c.nom)));
    const langue = langueProbable(texte, o.ctx.vocabulaires, etat.decidee ? { minimum: 2, sansAutre: true, ignorer } : { ignorer });
    if (langue) { etat.session.langue = langue; etat.decidee = true; }
  }

  async function menu(etat: Etat, ctx: Contexte): Promise<string> {
    const langue = etat.session.langue;
    etat.accueil = true;
    const client = await ctx.banque.client();
    return [ctx.reponses.rendre({ ref: 'RF001', valeurs: { name: client.prenom } }, langue, 'ussd').texte,
      ...o.menu.map((m, i) => ctx.reponses.rendre({ ref: m.ref, prefixe: `${i + 1}. ` }, langue, 'ussd').texte)].join('\n');
  }

  // Un appel USSD qui commence : le choix de la langue pour un numéro jamais vu dont la passerelle ne dit pas la langue ;
  // l'opération en attente s'il y en a une (commencée sur un autre canal) ; sinon le menu
  async function debutUssd(etat: Etat, ctx: Contexte, tour: TourRecu) {
    const s = etat.session;
    const limite = tour.constraints?.max_chars || 182;
    if (!tour.language && !etat.decidee && !(await o.preferences.lire(tour.phone))) {
      etat.choix = true;
      return corps(s, ajuster(ecranDeChoix(ctx.reponses, o.langues, null), limite), 'question');
    }
    if (s.attente) {
      const tx = s.brouillon?.transaction;
      return corps(s, ajuster(s.derniere.map((m) => ctx.reponses.rendre(m, s.langue, 'ussd').texte).join('\n'), limite), 'question', { tx: tx ? { id: tx, etat: 'attente' } : null });
    }
    const ecran = await menu(etat, ctx).catch(() => ctx.reponses.rendre({ ref: 'RF064' }, s.langue, 'ussd').texte);
    return corps(s, ajuster(ecran, limite), 'inconnue');
  }

  // La réponse à l'écran de choix : le numéro ou le nom d'une langue la choisit ; une phrase le referme et sera comprise
  async function choixDeLangue(etat: Etat, ctx: Contexte, tour: TourRecu, texte: string) {
    etat.choix = false;
    const code = langueChoisie(texte, o.langues);
    if (!code) return null;
    etat.decidee = true;
    etat.session.langue = code;
    await o.preferences.ecrire(tour.phone, code);
    const ecran = await menu(etat, ctx).catch(() => ctx.reponses.rendre({ ref: 'RF064' }, code, 'ussd').texte);
    return corps(etat.session, ajuster(ecran, tour.constraints?.max_chars || 182), 'langue');
  }

  async function comprendreEtRepondre(etat: Etat, ctx: Contexte, tour: TourRecu, texte: string, langueDebut: string) {
    const s = etat.session;
    const ussd = tour.channel === 'ussd';
    const avant = s.brouillon?.intention;
    let t: Tour;
    try {
      t = await traiter(ctx, s, texte);
    } catch {
      // Banque injoignable avant même de comprendre (carnet) : une réponse valide, rien n'est fait, et on le dit
      return corps(s, ctx.reponses.rendre({ ref: 'RF064' }, s.langue, tour.channel).texte, 'inconnue', { fin: ussd });
    }
    if (s.langue !== langueDebut) { etat.decidee = true; await o.preferences.ecrire(tour.phone, s.langue); }
    const j = t.journal;
    const reponse = ajuster(t.texte, tour.constraints?.max_chars || (ussd ? 182 : 2000));
    const operation = avant || s.brouillon?.intention || (ARGENT.has(j.intention || '') ? j.intention || undefined : undefined);
    const fin = ussd && (j.statut === 'executee' || j.intention === 'terminer' || (j.statut === 'annulee' && !/sans suite/.test(j.validation)));
    o.noter({ ...j, requete: texte, reponse });
    return corps(s, reponse, cleIntention(t, operation), {
      fin, parametres: parametresDe(j.parametres || {}, p.devise),
      tx: t.transaction || (s.brouillon?.transaction ? { id: s.brouillon.transaction, etat: 'attente' } : null),
    });
  }

  async function repondre(etat: Etat, tour: TourRecu) {
    const s = etat.session;
    s.canal = tour.channel;
    etat.vu = Date.now();
    const langueDebut = s.langue;
    langueRecue(etat, tour.language ?? null);
    const brute = banqueApi({ profil: p.banque, cle: o.cle, trace: tour.trace_id, telephone: tour.phone, appeler: o.appeler });
    const ctx: Contexte = { ...o.ctx, banque: { ...brute, carnet: async () => (etat.carnet ??= await brute.carnet()) } };
    const ussd = tour.channel === 'ussd';
    let texte = (tour.input?.text || '').trim();
    if (ussd && !texte) return debutUssd(etat, ctx, tour);
    if (etat.choix) {
      const choisie = await choixDeLangue(etat, ctx, tour, texte);
      if (choisie) return choisie;
    }
    // La langue se lit dans ce que la personne a tapé, jamais dans la demande interne d'une ligne du menu
    await reconnaitre(etat, ctx, texte);
    if (ussd && etat.accueil && !s.attente && /^\d$/.test(texte)) texte = o.menu[Number(texte) - 1]?.demande || texte;
    etat.accueil = false;
    return comprendreEtRepondre(etat, ctx, tour, texte, langueDebut);
  }

  return async function tourDeCanal(requete: Request): Promise<Response> {
    const tour = lireTour(await requete.text());
    if (!tour) return json(corps(nouvelleSession('', 'web', 'fr'), o.ctx.reponses.rendre({ ref: 'RF056' }, 'fr').texte, 'inconnue', { fin: true }));
    const cle = await empreinteNumero(tour.phone);
    const etat = await etatDe(tour, cle);
    const reponse = await repondre(etat, tour);
    await memoire.ecrire(cle, etat);
    return json(reponse);
  };
}
