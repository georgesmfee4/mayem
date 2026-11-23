// Canal USSD (*123#). L'opérateur appelle une adresse à chaque étape, avec tout ce que l'utilisateur a tapé depuis
// le début (« 2*677123456*5000 ») ; on répond « CON texte » (la session continue) ou « END texte » (elle s'arrête).
// C'est la convention la plus répandue des passerelles USSD africaines ; seules lireUssd et ecrireUssd en dépendent.
//
// Deux façons de servir :
// - relais : Mayem se place entre l'opérateur et le service USSD existant. Chaque écran du service est traduit, les
//   chiffres tapés passent tels quels. Une phrase (« envoie 5000 au 677 12 34 56 ») devient le chemin de touches que
//   le service attend (raccourcis du profil) : le service n'a rien à changer.
// - conversation : sans service à relayer, le noyau conversationnel répond lui-même, menu compris.

import { comprendre } from '../core/comprendre.ts';
import { empreinteOperation, type Operation } from '../core/operation.ts';
import type { Pack } from '../core/types.ts';
import { nouvelleSession, traiter, type Contexte, type Session } from './conversation.ts';
import type { LigneJournal } from './journal.ts';
import { traduireEcran, type Bilan } from './traduction.ts';

export interface ProfilUssd {
  // Adresse du service USSD existant ; absente : Mayem répond lui-même
  service?: string;
  code?: string;
  // Intention -> touches à taper depuis le premier écran ; {telephone} et {montant} sont remplis par Mayem
  raccourcis?: Record<string, string[]>;
  // Écran qui demande un code secret : la saisie suivante n'est ni comprise ni journalisée
  secret?: string;
  // Écran final qui dit que l'opération est faite (« Opération réussie ») : elle est notée exécutée
  succes?: string;
  // Mode conversation : choix du premier écran (libellé du tableur des menus et demande comprise par le noyau)
  menu?: { ref: string; demande: string }[];
}

export interface EntreeUssd { session: string; telephone: string; code: string; saisies: string[] }
export interface SortieUssd { texte: string; fin: boolean; journal: LigneJournal }

export const LIMITE_ECRAN = 182;
const SECRET = /\b(pin|code secret|mot de passe)\b/i;

export function lireUssd(champs: URLSearchParams): EntreeUssd {
  const texte = champs.get('text') || '';
  return {
    session: champs.get('sessionId') || '',
    telephone: (champs.get('phoneNumber') || '').replace(/\D/g, '').slice(-9),
    code: champs.get('serviceCode') || '',
    saisies: texte === '' ? [] : texte.split('*'),
  };
}

export const ecrireUssd = (sortie: { texte: string; fin: boolean }) => `${sortie.fin ? 'END' : 'CON'} ${sortie.texte}`;

interface EtatRelais {
  langue: string;
  // Ce que le service a reçu, touche par touche, et ce que l'utilisateur a tapé et qui est déjà traité
  chemin: string[];
  traitees: number;
  attente: { intention: string; montant?: number; telephone?: string } | null;
  secret: boolean;
  ecran: string;
}

export interface Relais {
  pack: Pack;
  ctx: Contexte;
  profil: ProfilUssd;
  appeler: typeof fetch;
  etats: Map<string, EtatRelais>;
  langueParDefaut: string;
}

// Les raccourcis lus à l'envers : le chemin tapé (même à la main, touche par touche) dit quelle opération est en cours.
// La même opération donne la même empreinte que sur les autres canaux.
export function operationDuChemin(raccourcis: Record<string, string[]>, chemin: string[]): Operation | null {
  for (const intention of ['transfert', 'credit']) {
    const touches = raccourcis[intention];
    if (!touches || chemin.length < touches.length) continue;
    const valeurs: Record<string, string> = {};
    const accord = touches.every((t, i) => (/^\{\w+\}$/.test(t) ? (valeurs[t] = chemin[i], true) : t === chemin[i]));
    const montant = Number(valeurs['{montant}']);
    if (accord && /^6\d{8}$/.test(valeurs['{telephone}'] || '') && montant > 0) {
      return { intention: intention as Operation['intention'], montant, telephone: valeurs['{telephone}'] };
    }
  }
  return null;
}

async function suivi(r: Relais, chemin: string[], fin: boolean, ecran: string) {
  const operation = operationDuChemin(r.profil.raccourcis || {}, chemin);
  if (!operation) return {};
  const reussie = fin && Boolean(r.profil.succes && new RegExp(r.profil.succes, 'i').test(ecran));
  return {
    operation, empreinte: await empreinteOperation(operation),
    statut: (reussie ? 'executee' : fin ? 'information' : 'en_attente_confirmation') as LigneJournal['statut'],
  };
}

function ligne(base: Partial<LigneJournal> & { session: string; langue: string; requete: string; reponse: string }): LigneJournal {
  return {
    equipe: 'Mayem', canal: 'ussd', intention: 'navigation', raison: '', parametres: {}, reponses: [], statut: 'information',
    validation: '', operation: null, empreinte: null, temps_ms: 0, erreurs: [], ...base,
  };
}

async function appelerService(r: Relais, entree: EntreeUssd, chemin: string[]) {
  const corps = new URLSearchParams({ sessionId: entree.session, serviceCode: entree.code || r.profil.code || '', phoneNumber: entree.telephone, text: chemin.join('*') });
  const reponse = await r.appeler(r.profil.service!, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corps });
  const brut = (await reponse.text()).trim();
  const [, mot, ecran] = brut.match(/^(CON|END)\s?([\s\S]*)$/) || ['', 'END', brut];
  return { fin: mot === 'END', ecran };
}

// Écran du service, traduit ligne à ligne ; s'il dépasse la place d'un écran USSD, il reste tel que le service l'a écrit
function ecranTraduit(r: Relais, etat: EtatRelais, ecran: string, bilan: Bilan) {
  if (etat.langue === 'fr') return ecran;
  const traduit = traduireEcran(ecran, r.pack, bilan);
  return traduit.length <= LIMITE_ECRAN ? traduit : ecran;
}

const rendre = (r: Relais, etat: EtatRelais, ref: string, valeurs?: Record<string, string>) =>
  r.ctx.reponses.rendre(valeurs ? { ref, valeurs } : { ref }, etat.langue).texte;

// Une phrase : l'intention et ses valeurs, ou une question si une valeur manque
async function phrase(r: Relais, etat: EtatRelais, saisie: string) {
  const c = comprendre(saisie, { lexiques: r.ctx.lexiques, termes: r.ctx.termes });
  if (c.intention === 'langue' && c.langue) {
    etat.langue = c.langue === 'fr' ? 'fr' : r.ctx.nationale.code;
    return { rien: true, comprise: c, avant: rendre(r, etat, 'RF100', { langue: etat.langue === 'fr' ? 'français' : r.ctx.nationale.nom.toLowerCase() }) };
  }
  const intention = etat.attente?.intention || c.intention || '';
  const touches = r.profil.raccourcis?.[intention];
  if (!touches) return { rien: true, comprise: c, avant: rendre(r, etat, 'RF056') };
  const garde = <T extends { rejete: boolean }>(liste: T[]) => liste.filter((v) => !v.rejete).pop();
  const voulu = { intention, montant: garde(c.montants)?.valeur ?? etat.attente?.montant, telephone: garde(c.telephones)?.numero ?? etat.attente?.telephone };
  const besoin = touches.join(' ');
  if (besoin.includes('{montant}') && voulu.montant === undefined) { etat.attente = voulu; return { question: rendre(r, etat, 'RF030'), comprise: c }; }
  if (besoin.includes('{telephone}') && !voulu.telephone) { etat.attente = voulu; return { question: rendre(r, etat, 'RF031'), comprise: c }; }
  etat.attente = null;
  const chemin = touches.map((t) => t.replace('{montant}', String(voulu.montant)).replace('{telephone}', voulu.telephone || ''));
  return { chemin, comprise: c };
}

export async function relayer(r: Relais, entree: EntreeUssd): Promise<SortieUssd> {
  const debut = performance.now();
  let etat = r.etats.get(entree.session);
  if (!etat || entree.saisies.length === 0) {
    etat = { langue: r.langueParDefaut, chemin: [], traitees: 0, attente: null, secret: false, ecran: '' };
    r.etats.set(entree.session, etat);
  }
  const nouvelles = entree.saisies.slice(etat.traitees);
  etat.traitees = entree.saisies.length;
  const saisie = nouvelles.join('*');
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const etaitSecret = etat.secret;
  const base = { session: entree.session, langue: etat.langue, requete: etaitSecret ? '****' : saisie };

  // Une phrase en lettres est comprise, comme la réponse à une question de Mayem ; sinon les chiffres (choix,
  // numéro, montant, code) passent tels quels au service
  if (saisie && !etaitSecret && (etat.attente || /\p{L}/u.test(saisie))) {
    const p = await phrase(r, etat, saisie);
    if ('question' in p) {
      return { texte: p.question!, fin: false, journal: ligne({ ...base, intention: p.comprise.intention || 'précision', raison: p.comprise.raison, reponse: p.question!, statut: 'clarification', validation: 'valeur manquante demandée', temps_ms: performance.now() - debut }) };
    }
    if ('rien' in p) {
      const texte = [p.avant, ecranTraduit(r, etat, etat.ecran, bilan)].filter(Boolean).join('\n');
      return { texte, fin: false, journal: ligne({ ...base, langue: etat.langue, intention: p.comprise.intention || 'non comprise', raison: p.comprise.raison, reponse: texte, statut: 'information', temps_ms: performance.now() - debut }) };
    }
    etat.chemin = p.chemin!;
    const service = await appelerService(r, entree, etat.chemin);
    etat.ecran = service.ecran;
    etat.secret = SECRET.test(service.ecran) || Boolean(r.profil.secret && new RegExp(r.profil.secret, 'i').test(service.ecran));
    const texte = ecranTraduit(r, etat, service.ecran, bilan);
    return {
      texte, fin: service.fin, journal: ligne({
        ...base, intention: p.comprise.intention || 'raccourci', raison: p.comprise.raison, parametres: { chemin: etat.chemin.join('*'), traduits: bilan.traduits, conserves: bilan.conserves },
        reponse: texte, validation: 'phrase traduite en touches et relayée au service', ...(await suivi(r, etat.chemin, service.fin, service.ecran)), temps_ms: performance.now() - debut,
      }),
    };
  }

  if (saisie) etat.chemin.push(...nouvelles);
  const service = await appelerService(r, entree, etat.chemin);
  etat.ecran = service.ecran;
  etat.secret = SECRET.test(service.ecran) || Boolean(r.profil.secret && new RegExp(r.profil.secret, 'i').test(service.ecran));
  const texte = ecranTraduit(r, etat, service.ecran, bilan);
  // Une saisie secrète n'apparaît pas dans le chemin journalisé
  const chemin = etat.chemin.map((t, i) => (etaitSecret && i >= etat!.chemin.length - nouvelles.length ? '****' : t)).join('*');
  const etape = await suivi(r, etat.chemin, service.fin, service.ecran);
  const validation = etape.statut === 'executee' ? 'confirmée par l\'utilisateur, exécutée par le service' : service.fin ? 'écran final du service' : 'relayé au service';
  return { texte, fin: service.fin, journal: ligne({ ...base, parametres: { chemin, traduits: bilan.traduits, conserves: bilan.conserves }, reponse: texte, validation, ...etape, temps_ms: performance.now() - debut }) };
}

// Sans service à relayer : le noyau conversationnel répond, le premier écran propose le menu du profil
export async function converserUssd(ctx: Contexte, profil: ProfilUssd, sessions: Map<string, Session>, entree: EntreeUssd, langue: string): Promise<SortieUssd> {
  let session = sessions.get(entree.session);
  if (!session || entree.saisies.length === 0) {
    session = nouvelleSession(entree.session, 'ussd', langue);
    sessions.set(entree.session, session);
    const client = await ctx.banque.client();
    const lignes = [ctx.reponses.rendre({ ref: 'RF001', valeurs: { name: client.prenom } }, langue).texte,
      ...(profil.menu || []).map((m, i) => ctx.reponses.rendre({ ref: m.ref, prefixe: `${i + 1}. ` }, langue).texte)];
    const texte = lignes.join('\n');
    return { texte, fin: false, journal: ligne({ session: entree.session, langue, requete: '', reponse: texte, intention: 'accueil' }) };
  }
  const saisie = entree.saisies[entree.saisies.length - 1];
  const choix = !session.attente && /^\d$/.test(saisie) ? profil.menu?.[Number(saisie) - 1] : undefined;
  const tour = await traiter(ctx, session, choix ? choix.demande : saisie);
  const fin = ['executee', 'annulee'].includes(tour.journal.statut) || tour.journal.intention === 'terminer';
  return { texte: tour.texte, fin, journal: { ...tour.journal, requete: saisie } };
}
