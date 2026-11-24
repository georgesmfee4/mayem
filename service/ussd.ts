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
import { ecranDeChoix, langueChoisie, type Langue } from './choix-langue.ts';
import { nouvelleSession, traiter, type Contexte, type Session } from './conversation.ts';
import type { LigneJournal } from './journal.ts';
import type { Preferences } from './preferences.ts';
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

// champs : la requête de l'opérateur telle quelle, relayée au service sans rien y changer d'autre que « text »
export interface EntreeUssd { session: string; telephone: string; code: string; saisies: string[]; champs: URLSearchParams }
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
    champs,
  };
}

export const ecrireUssd = (sortie: { texte: string; fin: boolean }) => `${sortie.fin ? 'END' : 'CON'} ${sortie.texte}`;

// Où en est le choix de la langue : au premier appel, ou en cours de route (on reprendra l'écran quitté)
type Choix = 'debut' | 'reprise' | null;

interface EtatRelais {
  langue: string;
  // Ce que le service a reçu, touche par touche, et ce que l'utilisateur a tapé et qui est déjà traité
  chemin: string[];
  traitees: number;
  attente: { intention: string; montant?: number; telephone?: string } | null;
  secret: boolean;
  ecran: string;
  fin: boolean;
  choix: Choix;
}

export interface Relais {
  pack: Pack;
  ctx: Contexte;
  profil: ProfilUssd;
  appeler: typeof fetch;
  etats: Map<string, EtatRelais>;
  langueParDefaut: string;
  langues: Langue[];
  preferences: Preferences;
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

// Le service reçoit la requête de l'opérateur à l'identique (numéro, session, code, champs en plus) ; seul « text »
// est le chemin de touches, qui est exactement ce que la personne a tapé tant qu'elle n'écrit pas de phrase
async function appelerService(r: Relais, entree: EntreeUssd, chemin: string[]) {
  const corps = new URLSearchParams(entree.champs);
  corps.set('text', chemin.join('*'));
  if (!corps.get('serviceCode') && r.profil.code) corps.set('serviceCode', r.profil.code);
  const reponse = await r.appeler(r.profil.service!, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corps });
  const brut = (await reponse.text()).trim();
  const [, mot, ecran] = brut.match(/^(CON|END)\s?([\s\S]*)$/) || ['', 'END', brut];
  return { fin: mot === 'END', ecran };
}

// Écran du service, traduit ligne à ligne et rien de plus ; s'il dépasse la place d'un écran USSD, il reste tel que
// le service l'a écrit
function afficher(r: Relais, etat: EtatRelais, bilan: Bilan): string {
  const traduit = etat.langue === 'fr' ? etat.ecran : traduireEcran(etat.ecran, r.pack, bilan);
  return traduit.length <= LIMITE_ECRAN ? traduit : etat.ecran;
}

async function servir(r: Relais, entree: EntreeUssd, etat: EtatRelais) {
  const service = await appelerService(r, entree, etat.chemin);
  etat.ecran = service.ecran;
  etat.fin = service.fin;
  etat.secret = SECRET.test(service.ecran) || Boolean(r.profil.secret && new RegExp(r.profil.secret, 'i').test(service.ecran));
  return service;
}

const rendre = (r: Relais, etat: EtatRelais, ref: string, valeurs?: Record<string, string>) =>
  r.ctx.reponses.rendre(valeurs ? { ref, valeurs } : { ref }, etat.langue, 'ussd').texte;

const nomDe = (r: Relais, code: string) => (code === 'fr' ? 'français' : r.langues.find((l) => l.code === code)?.nom.toLowerCase() || code);

// Une phrase : l'intention et ses valeurs, ou une question si une valeur manque. Le nom d'une langue change de
// langue ; « langue » seul rouvre le choix. Dans les deux cas, le service ne reçoit rien.
async function phrase(r: Relais, etat: EtatRelais, saisie: string, telephone: string) {
  const c = comprendre(saisie, { lexiques: r.ctx.lexiques, termes: r.ctx.termes });
  if (c.intention === 'langue' && !c.langue && !etat.attente) return { choix: true, comprise: c };
  if (c.intention === 'langue' && c.langue) {
    etat.langue = c.langue === 'fr' ? 'fr' : r.ctx.nationale.code;
    await r.preferences.ecrire(telephone, etat.langue);
    return { rien: true, comprise: c, avant: rendre(r, etat, 'RF100', { langue: nomDe(r, etat.langue) }) };
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

// Au premier appel d'un numéro, la langue retenue pour lui, ou l'écran de choix
async function etatDe(r: Relais, entree: EntreeUssd): Promise<EtatRelais> {
  const connu = r.etats.get(entree.session);
  if (connu && entree.saisies.length > 0) return connu;
  const preferee = await r.preferences.lire(entree.telephone);
  const etat: EtatRelais = {
    langue: preferee || r.langueParDefaut, chemin: [], traitees: 0, attente: null, secret: false, ecran: '', fin: false,
    choix: preferee || entree.saisies.length > 0 ? null : 'debut',
  };
  r.etats.set(entree.session, etat);
  return etat;
}

// L'écran de choix est affiché ; la réponse choisit la langue, la garde pour ce numéro, puis reprend
async function choisir(r: Relais, entree: EntreeUssd, etat: EtatRelais, saisie: string, base: { session: string; langue: string; requete: string }, debut: number): Promise<SortieUssd> {
  const code = langueChoisie(saisie, r.langues);
  if (!code) {
    const texte = ecranDeChoix(r.ctx.reponses, r.langues, etat.choix === 'debut' ? null : etat.langue);
    return { texte, fin: false, journal: ligne({ ...base, intention: 'choix de la langue', reponse: texte, statut: 'clarification', validation: 'choix de la langue redemandé', temps_ms: performance.now() - debut }) };
  }
  const mode = etat.choix;
  etat.langue = code;
  etat.choix = null;
  await r.preferences.ecrire(entree.telephone, code);
  if (mode === 'debut') { etat.chemin = []; await servir(r, entree, etat); }
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const texte = afficher(r, etat, bilan);
  return {
    texte, fin: etat.fin, journal: ligne({
      ...base, langue: code, intention: 'langue', parametres: { langue: code, traduits: bilan.traduits, conserves: bilan.conserves }, reponse: texte,
      validation: mode === 'debut' ? 'langue choisie et gardée pour ce numéro' : 'langue changée et gardée pour ce numéro ; écran repris', temps_ms: performance.now() - debut,
    }),
  };
}

export async function relayer(r: Relais, entree: EntreeUssd): Promise<SortieUssd> {
  const debut = performance.now();
  const etat = await etatDe(r, entree);
  const nouvelles = entree.saisies.slice(etat.traitees);
  etat.traitees = entree.saisies.length;
  const saisie = nouvelles.join('*');
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const etaitSecret = etat.secret;
  const base = { session: entree.session, langue: etat.langue, requete: etaitSecret ? '****' : saisie };

  if (etat.choix === 'debut' && !saisie) {
    const texte = ecranDeChoix(r.ctx.reponses, r.langues, null);
    return { texte, fin: false, journal: ligne({ ...base, intention: 'choix de la langue', reponse: texte, statut: 'clarification', validation: 'premier appel : langue demandée', temps_ms: performance.now() - debut }) };
  }
  if (etat.choix) return choisir(r, entree, etat, saisie, base, debut);

  // Une phrase en lettres est comprise, comme la réponse à une question de Mayem ; sinon les chiffres (choix,
  // numéro, montant, code) passent tels quels au service
  if (saisie && !etaitSecret && (etat.attente || /\p{L}/u.test(saisie))) {
    const p = await phrase(r, etat, saisie, entree.telephone);
    if ('choix' in p) {
      etat.choix = 'reprise';
      const texte = ecranDeChoix(r.ctx.reponses, r.langues, etat.langue);
      return { texte, fin: false, journal: ligne({ ...base, intention: 'langue', reponse: texte, statut: 'clarification', validation: 'choix de la langue demandé ; le service n\'a rien reçu', temps_ms: performance.now() - debut }) };
    }
    if ('question' in p) {
      return { texte: p.question!, fin: false, journal: ligne({ ...base, intention: p.comprise.intention || 'précision', raison: p.comprise.raison, reponse: p.question!, statut: 'clarification', validation: 'valeur manquante demandée', temps_ms: performance.now() - debut }) };
    }
    if ('rien' in p) {
      const texte = [p.avant, etat.ecran ? afficher(r, etat, bilan) : ''].filter(Boolean).join('\n');
      const validation = p.comprise.intention === 'langue' ? 'langue changée et gardée pour ce numéro ; le service n\'a rien reçu' : '';
      return { texte, fin: false, journal: ligne({ ...base, langue: etat.langue, intention: p.comprise.intention || 'non comprise', raison: p.comprise.raison, reponse: texte, statut: 'information', validation, temps_ms: performance.now() - debut }) };
    }
    etat.chemin = p.chemin!;
    const service = await servir(r, entree, etat);
    const texte = afficher(r, etat, bilan);
    return {
      texte, fin: service.fin, journal: ligne({
        ...base, intention: p.comprise.intention || 'raccourci', raison: p.comprise.raison, parametres: { chemin: etat.chemin.join('*'), traduits: bilan.traduits, conserves: bilan.conserves },
        reponse: texte, validation: 'phrase traduite en touches et relayée au service', ...(await suivi(r, etat.chemin, service.fin, service.ecran)), temps_ms: performance.now() - debut,
      }),
    };
  }

  if (saisie) etat.chemin.push(...nouvelles);
  const service = await servir(r, entree, etat);
  const texte = afficher(r, etat, bilan);
  // Une saisie secrète n'apparaît pas dans le chemin journalisé
  const chemin = etat.chemin.map((t, i) => (etaitSecret && i >= etat.chemin.length - nouvelles.length ? '****' : t)).join('*');
  const etape = await suivi(r, etat.chemin, service.fin, service.ecran);
  const validation = etape.statut === 'executee' ? 'confirmée par l\'utilisateur, exécutée par le service' : service.fin ? 'écran final du service' : 'relayé au service';
  return { texte, fin: service.fin, journal: ligne({ ...base, parametres: { chemin, traduits: bilan.traduits, conserves: bilan.conserves }, reponse: texte, validation, ...etape, temps_ms: performance.now() - debut }) };
}

// Sans service à relayer : le noyau conversationnel répond lui-même, avec le même choix de langue que le relais
export interface Autonome {
  ctx: Contexte;
  profil: ProfilUssd;
  sessions: Map<string, Session>;
  marques: Map<string, { choix: Choix; accueil: boolean }>;
  langueParDefaut: string;
  langues: Langue[];
  preferences: Preferences;
}

async function accueil(a: Autonome, langue: string): Promise<string> {
  const client = await a.ctx.banque.client();
  return [a.ctx.reponses.rendre({ ref: 'RF001', valeurs: { name: client.prenom } }, langue).texte,
    ...(a.profil.menu || []).map((m, i) => a.ctx.reponses.rendre({ ref: m.ref, prefixe: `${i + 1}. ` }, langue).texte)].join('\n');
}

export async function converserUssd(a: Autonome, entree: EntreeUssd): Promise<SortieUssd> {
  const debut = performance.now();
  let session = a.sessions.get(entree.session);
  let marque = a.marques.get(entree.session);
  if (!session || !marque || entree.saisies.length === 0) {
    const preferee = await a.preferences.lire(entree.telephone);
    session = nouvelleSession(entree.session, 'ussd', preferee || a.langueParDefaut);
    marque = { choix: preferee ? null : 'debut', accueil: true };
    a.sessions.set(entree.session, session);
    a.marques.set(entree.session, marque);
    const texte = marque.choix ? ecranDeChoix(a.ctx.reponses, a.langues, null) : await accueil(a, session.langue);
    return { texte, fin: false, journal: ligne({ session: entree.session, langue: session.langue, requete: '', reponse: texte, intention: marque.choix ? 'choix de la langue' : 'accueil', temps_ms: performance.now() - debut }) };
  }
  const saisie = entree.saisies[entree.saisies.length - 1];
  const base = { session: entree.session, langue: session.langue, requete: saisie };
  if (marque.choix) {
    const code = langueChoisie(saisie, a.langues);
    if (!code) {
      const texte = ecranDeChoix(a.ctx.reponses, a.langues, marque.choix === 'debut' ? null : session.langue);
      return { texte, fin: false, journal: ligne({ ...base, intention: 'choix de la langue', reponse: texte, statut: 'clarification', validation: 'choix de la langue redemandé', temps_ms: performance.now() - debut }) };
    }
    const mode = marque.choix;
    session.langue = code;
    marque.choix = null;
    await a.preferences.ecrire(entree.telephone, code);
    const texte = await ecranQuitte(a, session, marque, code);
    return { texte, fin: false, journal: ligne({ ...base, langue: code, intention: 'langue', parametres: { langue: code }, reponse: texte, validation: mode === 'debut' ? 'langue choisie et gardée pour ce numéro' : 'langue changée et gardée pour ce numéro ; écran repris', temps_ms: performance.now() - debut }) };
  }
  const choix = marque.accueil && !session.attente && /^\d$/.test(saisie) ? a.profil.menu?.[Number(saisie) - 1] : undefined;
  const avant = { derniere: session.derniere, accueil: marque.accueil };
  const tour = await traiter(a.ctx, session, choix ? choix.demande : saisie);
  if (tour.journal.intention === 'langue') return langueEcrite(a, entree, session, marque, avant, { ...tour.journal, requete: saisie }, tour.texte);
  marque.accueil = false;
  const fin = ['executee', 'annulee'].includes(tour.journal.statut) || tour.journal.intention === 'terminer';
  return { texte: tour.texte, fin, journal: { ...tour.journal, requete: saisie } };
}

// L'écran que la personne avait sous les yeux, redit dans la langue voulue
const ecranQuitte = async (a: Autonome, session: Session, marque: { accueil: boolean }, langue: string) =>
  (marque.accueil || !session.derniere.length ? accueil(a, langue) : session.derniere.map((m) => a.ctx.reponses.rendre(m, langue).texte).join('\n'));

// Le nom d'une langue écrit, ou « langue » seul (le noyau a montré le choix) : l'écran quitté reste celui à reprendre
async function langueEcrite(a: Autonome, entree: EntreeUssd, session: Session, marque: { choix: Choix; accueil: boolean },
  avant: { derniere: Session['derniere']; accueil: boolean }, journal: LigneJournal, texte: string): Promise<SortieUssd> {
  session.derniere = avant.derniere;
  marque.accueil = avant.accueil;
  if (!journal.validation.startsWith('langue changée')) { marque.choix = 'reprise'; return { texte, fin: false, journal }; }
  await a.preferences.ecrire(entree.telephone, session.langue);
  // Une opération en cours est déjà redite par le noyau, avec la même empreinte
  if (session.attente) return { texte, fin: false, journal };
  return { texte: `${texte}\n${await ecranQuitte(a, session, marque, session.langue)}`, fin: false, journal };
}
