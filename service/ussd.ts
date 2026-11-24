// Canal USSD (*123#). L'opérateur appelle une adresse à chaque étape, avec tout ce que l'utilisateur a tapé depuis
// le début (« 2*677123456*5000 ») ; on répond « CON texte » (la session continue) ou « END texte » (elle s'arrête).
// C'est la convention la plus répandue des passerelles USSD africaines ; seules lireUssd et ecrireUssd en dépendent.
//
// Deux façons de servir :
// - relais : Mayem se place entre l'opérateur et le service USSD existant. Chaque écran du service est traduit, les
//   chiffres tapés passent tels quels. Une phrase (« envoie 5000 au 677 12 34 56 ») devient le chemin de touches que
//   le service attend (raccourcis du profil), après les questions du noyau s'il manque quelque chose
//   (service/phrase-relayee.ts) : le service n'a rien à changer.
// - conversation : sans service à relayer, le noyau conversationnel répond lui-même, menu compris.

import { empreinteOperation, type Operation } from '../core/operation.ts';
import type { Pack } from '../core/types.ts';
import { ecranDeChoix, langueChoisie, type Langue } from './choix-langue.ts';
import { nouvelleSession, traiter, type Contexte, type Session } from './conversation.ts';
import { lirePhrase, sessionRelayee, type Phrase } from './phrase-relayee.ts';
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
// Au-delà, le service est tenu pour muet : l'opérateur coupe de toute façon une session USSD qui attend trop
const DELAI_SERVICE = 8000;

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
  // La conversation sur une phrase écrite : ses questions en cours (montant, contact) avant d'aller au service
  session: Session;
  // Phrases de suite que Mayem n'a pas comprises
  incomprises: number;
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
  const reponse = await r.appeler(r.profil.service!, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corps, signal: AbortSignal.timeout(DELAI_SERVICE),
  });
  if (!reponse.ok) throw new Error(`service USSD : réponse ${reponse.status}`);
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

// Ce que la personne voyait, redit dans la langue en cours : la question de Mayem en attente, sinon l'écran du service
function ecranEnCours(r: Relais, etat: EtatRelais, bilan: Bilan): string {
  if (etat.session.attente) return etat.session.derniere.map((m) => r.ctx.reponses.rendre(m, etat.langue, 'ussd').texte).join('\n');
  return etat.ecran ? afficher(r, etat, bilan) : '';
}

// Un écran de Mayem qui déborderait d'un écran USSD perd ses dernières lignes, jamais la première
function tenir(texte: string): string {
  const lignes = texte.split('\n');
  while (lignes.length > 1 && lignes.join('\n').length > LIMITE_ECRAN) lignes.pop();
  return lignes.join('\n');
}

// Une réponse de Mayem au-dessus de l'écran du service, s'il tient encore dans un écran USSD ; sinon elle seule
const audessus = (message: string, ecran: string) => {
  const ensemble = [message, ecran].filter(Boolean).join('\n');
  return ensemble.length <= LIMITE_ECRAN ? ensemble : tenir(message);
};

type Base = { session: string; langue: string; requete: string };

// Le nom d'une langue écrit : elle est gardée pour ce numéro et l'écran en cours revient, sans rien envoyer au service
async function changerLangue(r: Relais, entree: EntreeUssd, etat: EtatRelais, code: string, base: Base, debut: number): Promise<SortieUssd> {
  etat.langue = code;
  etat.session.langue = code;
  await r.preferences.ecrire(entree.telephone, code);
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const texte = audessus(rendre(r, etat, 'RF100', { langue: nomDe(r, code) }), ecranEnCours(r, etat, bilan));
  return { texte, fin: false, journal: ligne({ ...base, langue: code, intention: 'langue', parametres: { langue: code }, reponse: texte, validation: 'langue changée et gardée pour ce numéro ; le service n\'a rien reçu', temps_ms: performance.now() - debut }) };
}

// Des touches pour l'écran du service : elles s'ajoutent au chemin et lui partent telles quelles
async function toucher(r: Relais, entree: EntreeUssd, etat: EtatRelais, touches: string[], etaitSecret: boolean, base: Base, debut: number): Promise<SortieUssd> {
  etat.chemin.push(...touches);
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const service = await servir(r, entree, etat);
  const texte = afficher(r, etat, bilan);
  // Une saisie secrète n'apparaît pas dans le chemin journalisé
  const chemin = etat.chemin.map((t, i) => (etaitSecret && i >= etat.chemin.length - touches.length ? '****' : t)).join('*');
  const etape = await suivi(r, etat.chemin, service.fin, service.ecran);
  const validation = etape.statut === 'executee' ? 'confirmée par l\'utilisateur, exécutée par le service' : service.fin ? 'écran final du service' : 'relayé au service';
  return { texte, fin: service.fin, journal: ligne({ ...base, parametres: { chemin, traduits: bilan.traduits, conserves: bilan.conserves }, reponse: texte, validation, ...etape, temps_ms: performance.now() - debut }) };
}

// L'opération complète (ou un raccourci) : le chemin de touches remplace le parcours en cours, depuis le premier écran
async function versService(r: Relais, entree: EntreeUssd, etat: EtatRelais, chemin: string[], journal: Partial<LigneJournal>, base: Base, debut: number): Promise<SortieUssd> {
  etat.chemin = chemin;
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const service = await servir(r, entree, etat);
  const texte = afficher(r, etat, bilan);
  return {
    texte, fin: service.fin, journal: ligne({
      ...base, ...journal, parametres: { chemin: chemin.join('*'), traduits: bilan.traduits, conserves: bilan.conserves }, reponse: texte,
      ...(await suivi(r, chemin, service.fin, service.ecran)), temps_ms: performance.now() - debut,
    }),
  };
}

async function phraseRelayee(r: Relais, entree: EntreeUssd, etat: EtatRelais, saisie: string, base: Base, debut: number): Promise<SortieUssd> {
  etat.session.langue = etat.langue;
  const p: Phrase = { ctx: r.ctx, raccourcis: r.profil.raccourcis || {}, ecran: etat.ecran, appelant: entree.telephone };
  const suite = await lirePhrase(p, etat.session, saisie, etat.incomprises);
  const temps_ms = () => performance.now() - debut;
  if ('choix' in suite) {
    etat.choix = 'reprise';
    const texte = ecranDeChoix(r.ctx.reponses, r.langues, etat.langue);
    return { texte, fin: false, journal: ligne({ ...base, intention: 'langue', reponse: texte, statut: 'clarification', validation: 'choix de la langue demandé ; le service n\'a rien reçu', temps_ms: temps_ms() }) };
  }
  if ('langue' in suite) return changerLangue(r, entree, etat, suite.langue, base, debut);
  etat.incomprises = 'message' in suite && !suite.comprise.intention ? etat.incomprises + 1 : 0;
  if ('touches' in suite) {
    // Une touche de menu pendant une question, ou « oui »/« non » à l'écran du service : on retourne au service
    etat.session = sessionRelayee(entree.session, etat.langue, entree.telephone);
    return toucher(r, entree, etat, suite.touches, false, base, debut);
  }
  if ('question' in suite) {
    const texte = tenir(suite.question);
    return { texte, fin: false, journal: { ...suite.tour.journal, requete: saisie, reponse: texte, temps_ms: temps_ms() } };
  }
  if ('chemin' in suite) {
    const vient = suite.tour ? { intention: suite.tour.journal.intention, raison: suite.tour.journal.raison, validation: suite.tour.journal.validation }
      : { intention: suite.comprise.intention || 'raccourci', raison: suite.comprise.raison, validation: 'phrase traduite en touches et relayée au service' };
    return versService(r, entree, etat, suite.chemin, vient, base, debut);
  }
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const texte = audessus(suite.message, ecranEnCours(r, etat, bilan));
  if (suite.tour) return { texte, fin: false, journal: { ...suite.tour.journal, requete: saisie, reponse: texte, temps_ms: temps_ms() } };
  const c = suite.comprise;
  return {
    texte, fin: false, journal: ligne({
      ...base, intention: c.intention || 'non comprise', raison: c.raison, reponse: texte, statut: 'information', temps_ms: temps_ms(),
      validation: c.intention ? 'comprise, mais faisable seulement par les écrans du service : aide donnée' : 'phrase non comprise : rien envoyé au service',
    }),
  };
}

// Au premier appel d'un numéro, la langue retenue pour lui, ou l'écran de choix
async function etatDe(r: Relais, entree: EntreeUssd): Promise<EtatRelais> {
  const connu = r.etats.get(entree.session);
  if (connu && entree.saisies.length > 0) return connu;
  const preferee = await r.preferences.lire(entree.telephone);
  const langue = preferee || r.langueParDefaut;
  const etat: EtatRelais = {
    langue, chemin: [], traitees: 0, session: sessionRelayee(entree.session, langue, entree.telephone), incomprises: 0, secret: false, ecran: '', fin: false,
    choix: preferee || entree.saisies.length > 0 ? null : 'debut',
  };
  r.etats.set(entree.session, etat);
  return etat;
}

// L'écran de choix est affiché ; la réponse choisit la langue, la garde pour ce numéro, puis reprend l'écran quitté.
// En cours de route, une réponse qui n'est pas une langue referme le choix : elle est traitée comme une saisie
// ordinaire (null). Au premier appel, le choix est redemandé.
async function choisir(r: Relais, entree: EntreeUssd, etat: EtatRelais, saisie: string, base: Base, debut: number): Promise<SortieUssd | null> {
  const code = langueChoisie(saisie, r.langues);
  if (!code && etat.choix === 'reprise') { etat.choix = null; return null; }
  if (!code) {
    const texte = ecranDeChoix(r.ctx.reponses, r.langues, null);
    return { texte, fin: false, journal: ligne({ ...base, intention: 'choix de la langue', reponse: texte, statut: 'clarification', validation: 'choix de la langue redemandé', temps_ms: performance.now() - debut }) };
  }
  const mode = etat.choix;
  etat.langue = code;
  etat.session.langue = code;
  etat.choix = null;
  await r.preferences.ecrire(entree.telephone, code);
  if (mode === 'debut') { etat.chemin = []; await servir(r, entree, etat); }
  const bilan: Bilan = { traduits: 0, conserves: 0 };
  const texte = ecranEnCours(r, etat, bilan);
  return {
    texte, fin: etat.fin, journal: ligne({
      ...base, langue: code, intention: 'langue', parametres: { langue: code, traduits: bilan.traduits, conserves: bilan.conserves }, reponse: texte,
      validation: mode === 'debut' ? 'langue choisie et gardée pour ce numéro' : 'langue changée et gardée pour ce numéro ; écran repris', temps_ms: performance.now() - debut,
    }),
  };
}

async function parcourir(r: Relais, entree: EntreeUssd, etat: EtatRelais, debut: number): Promise<SortieUssd> {
  const nouvelles = entree.saisies.slice(etat.traitees);
  etat.traitees = entree.saisies.length;
  const saisie = nouvelles.join('*');
  const etaitSecret = etat.secret;
  const base = { session: entree.session, langue: etat.langue, requete: etaitSecret ? '****' : saisie };
  if (etat.choix === 'debut' && !saisie) {
    const texte = ecranDeChoix(r.ctx.reponses, r.langues, null);
    return { texte, fin: false, journal: ligne({ ...base, intention: 'choix de la langue', reponse: texte, statut: 'clarification', validation: 'premier appel : langue demandée', temps_ms: performance.now() - debut }) };
  }
  if (etat.choix) {
    const choisie = await choisir(r, entree, etat, saisie, base, debut);
    if (choisie) return choisie;
  }
  // Une phrase en lettres, ou la réponse à une question de Mayem, va au noyau ; sinon les chiffres (choix, numéro,
  // montant, code) passent tels quels au service. Jamais ce qui suit un écran de code secret.
  if (saisie && !etaitSecret && (etat.session.attente || /\p{L}/u.test(saisie))) return phraseRelayee(r, entree, etat, saisie, base, debut);
  return toucher(r, entree, etat, saisie ? nouvelles : [], etaitSecret, base, debut);
}

export async function relayer(r: Relais, entree: EntreeUssd): Promise<SortieUssd> {
  const debut = performance.now();
  const etat = await etatDe(r, entree);
  try {
    return await parcourir(r, entree, etat, debut);
  } catch (e) {
    // Le service ne répond pas (panne, délai dépassé, erreur) : rien n'a pu être fait ; on le dit, la session s'arrête
    r.etats.delete(entree.session);
    const texte = rendre(r, etat, 'RF064');
    return {
      texte, fin: true, journal: ligne({
        session: entree.session, langue: etat.langue, requete: etat.secret ? '****' : entree.saisies.at(-1) || '', reponse: texte, statut: 'erreur',
        validation: 'le service ne répond pas : rien exécuté', erreurs: [e instanceof Error ? e.message : String(e)], temps_ms: performance.now() - debut,
      }),
    };
  }
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
  // Une opération abandonnée faute de réponse utile laisse la session ouverte : la personne peut redire sa demande
  const abandon = /sans suite/.test(tour.journal.validation);
  const fin = tour.journal.statut === 'executee' || tour.journal.intention === 'terminer' || (tour.journal.statut === 'annulee' && !abandon);
  const texte = tenir(tour.texte);
  return { texte, fin, journal: { ...tour.journal, requete: saisie, reponse: texte } };
}

// L'écran que la personne avait sous les yeux, redit dans la langue voulue
const ecranQuitte = async (a: Autonome, session: Session, marque: { accueil: boolean }, langue: string) =>
  (marque.accueil || !session.derniere.length ? accueil(a, langue) : tenir(session.derniere.map((m) => a.ctx.reponses.rendre(m, langue, 'ussd').texte).join('\n')));

// Le nom d'une langue écrit, ou « langue » seul (le noyau a montré le choix) : l'écran quitté reste celui à reprendre
async function langueEcrite(a: Autonome, entree: EntreeUssd, session: Session, marque: { choix: Choix; accueil: boolean },
  avant: { derniere: Session['derniere']; accueil: boolean }, journal: LigneJournal, texte: string): Promise<SortieUssd> {
  session.derniere = avant.derniere;
  marque.accueil = avant.accueil;
  if (!journal.validation.startsWith('langue changée')) { marque.choix = 'reprise'; return { texte, fin: false, journal }; }
  await a.preferences.ecrire(entree.telephone, session.langue);
  // Une opération en cours est déjà redite par le noyau, avec la même empreinte
  if (session.attente) return { texte: tenir(texte), fin: false, journal };
  return { texte: tenir(`${texte}\n${await ecranQuitte(a, session, marque, session.langue)}`), fin: false, journal };
}
