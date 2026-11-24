// Le noyau conversationnel : une demande arrive d'un canal (application, web, USSD, SMS, voix, guichet), Mayem la
// comprend, pose une question s'il manque quelque chose ou s'il doute, fait confirmer avant tout mouvement
// d'argent, exécute auprès de la banque et répond avec des phrases validées. Chaque tour laisse une ligne de
// journal aux colonnes du tableau de bord du jury. Les canaux ne font que transporter le texte.
//
// Trois règles tiennent tout le reste :
// - rien ne part sans un « oui » à un récapitulatif qui redit montant, bénéficiaire, frais et total ;
// - dans le doute (intention faible, valeur manquante, contact ambigu, négation), on demande, on ne devine pas ;
// - l'état de l'opération ne dépend pas de la langue : on peut changer de langue au milieu sans rien perdre.

import { comprendre, normaliser, type Comprehension, type Contact, type Lexique, type Terme } from '../core/comprendre.ts';
import { empreinteOperation, type Operation } from '../core/operation.ts';
import type { Banque, Demande, Preparation, Refus, TypeEnvoi } from './banque.ts';
import { date, montant, pourcentage, telephone, type Morceau, type Rendu, type Reponses } from './reponses.ts';
import { ligneJournal, type LigneJournal, type Statut } from './journal.ts';

type Attente = 'montant' | 'beneficiaire' | 'choix_contact' | 'confirmation' | 'type_facture';
type IntentionArgent = 'transfert' | 'credit' | 'facture';

interface Brouillon {
  intention: IntentionArgent;
  montant?: number;
  nom?: string;
  telephone?: string;
  type?: TypeEnvoi;
  facture?: string;
  typeFacture?: string;
  frais?: number;
  // L'opération que la banque garde en attente depuis le récapitulatif
  transaction?: string;
}

export interface Session {
  id: string;
  canal: string;
  // 'fr' ou le code de la langue nationale
  langue: string;
  attente: Attente | null;
  brouillon: Brouillon | null;
  candidats: Contact[];
  // Dernière réponse, pour « répète »
  derniere: Morceau[];
  // Réponses de suite qui n'ont rien apporté à la question posée : à la troisième, on abandonne sans rien faire
  essais: number;
  // Devant un service relayé : l'opération complète lui est rendue (il récapitule, fait confirmer et exécute) ;
  // appelant : le numéro de la personne, pour un crédit sans autre numéro
  relais?: { appelant: string };
}

export interface Contexte {
  banque: Banque;
  reponses: Reponses;
  lexiques: Lexique[];
  termes: Terme[];
  nationale: { code: string; nom: string };
  // Choix de facture proposés au menu, dans l'ordre : le libellé vient du tableur des menus (« Électricité »)
  typesFacture: { type: string; ref: string }[];
}

// pret : devant un service relayé, l'opération complète à lui transmettre. transaction : l'opération de la banque
// touchée à ce tour (préparée, exécutée ou annulée)
export interface Transaction { id: string; etat: 'attente' | 'executee' | 'annulee' }
export interface Tour { texte: string; rendus: Rendu[]; journal: LigneJournal; pret?: Operation; transaction?: Transaction }

interface Decision {
  morceaux: Morceau[];
  statut: Statut;
  validation: string;
  operation?: Operation;
  parametres?: Record<string, unknown>;
  pret?: Operation;
  transaction?: Transaction;
}

const ARGENT = new Set(['transfert', 'credit', 'facture']);
const SANS_CONTEXTE = new Set(['oui', 'non', 'corriger']);

export function nouvelleSession(id: string, canal: string, langue: string): Session {
  return { id, canal, langue, attente: null, brouillon: null, candidats: [], derniere: [], essais: 0 };
}

const r = (ref: string, valeurs?: Record<string, string>): Morceau => (valeurs ? { ref, valeurs } : { ref });
// Pour confirmer : la phrase entière, ou sur un écran USSD les deux choix du menu, déjà validés (« 1. Confirmer »)
const confirmer = (): Morceau => ({ ...r('RF033'), court: [{ ref: 'U12', prefixe: '1. ' }, { ref: 'U13', prefixe: '2. ' }] });
// Un écran USSD tient en 182 signes : pas d'annonce (« je répète », « je corrige ») devant une réponse redite,
// l'écran qui change suffit ; des listes plus courtes
const ecranCourt = (s: Session) => s.canal === 'ussd';
const annonces = (s: Session, morceaux: Morceau[]) => (ecranCourt(s) ? [] : morceaux);
const info = (morceaux: Morceau[], validation = 'information donnée'): Decision => ({ morceaux, statut: 'information', validation });
const question = (morceaux: Morceau[], validation: string): Decision => ({ morceaux, statut: 'clarification', validation });

function oublier(s: Session) {
  s.attente = null;
  s.brouillon = null;
  s.candidats = [];
  s.essais = 0;
}

// Les valeurs que la personne garde (une valeur écartée, « pas 5 000 », ne compte pas) : la dernière dite gagne
const dernier = <T extends { rejete: boolean }>(liste: T[]): T | undefined => liste.filter((v) => !v.rejete).pop();
const apporteValeur = (c: Comprehension) =>
  Boolean(dernier(c.montants) || dernier(c.contacts) || dernier(c.telephones) || c.facture || c.typeFacture);

async function contactDuNumero(ctx: Contexte, numero: string) {
  return (await ctx.banque.carnet()).find((c) => c.telephone === numero);
}

// « Essomba » pour « Paul Essomba » : un mot du nom qui ne désigne qu'un seul des homonymes proposés
function parNom(candidats: Contact[], texte: string): Contact | undefined {
  const mots = new Set(normaliser(texte).split(' '));
  const trouves = candidats.filter((k) => normaliser(k.nom).split(' ').some((m) => m.length > 2 && mots.has(m)));
  return trouves.length === 1 ? trouves[0] : undefined;
}

// Reporte dans le brouillon ce que la demande apporte ; rend les corrections faites, pour les annoncer
async function completer(ctx: Contexte, s: Session, b: Brouillon, c: Comprehension, texte = ''): Promise<Morceau[]> {
  const annonces: Morceau[] = [];
  const somme = dernier(c.montants);
  if (somme) {
    if (b.montant !== undefined && b.montant !== somme.valeur) annonces.push(r('RF040', { amount: montant(somme.valeur), amount_2: montant(b.montant) }));
    b.montant = somme.valeur;
  }
  const choisi = s.attente !== 'choix_contact' ? undefined : c.touche ? s.candidats[Number(c.touche) - 1] : parNom(s.candidats, texte);
  const mention = dernier(c.contacts);
  const numero = dernier(c.telephones);
  const avant = b.telephone;
  if (choisi) definir(s, b, choisi);
  else if (mention && mention.contacts.length === 1) definir(s, b, mention.contacts[0]);
  else if (mention) { s.candidats = mention.contacts; b.telephone = undefined; b.nom = mention.contacts[0].nom.split(' ')[0]; }
  else if (numero) {
    const connu = await contactDuNumero(ctx, numero.numero);
    if (connu) definir(s, b, connu);
    else { s.candidats = []; b.telephone = numero.numero; b.nom = telephone(numero.numero); b.type = 'mobile'; }
  }
  if (avant && b.telephone && avant !== b.telephone) {
    annonces.push(mention || choisi ? r('RF041', { name: b.nom! }) : r('RF042', { phone: telephone(b.telephone) }));
  }
  if (c.facture) b.facture = c.facture;
  if (c.typeFacture) b.typeFacture = c.typeFacture;
  if (s.attente === 'type_facture' && c.touche) b.typeFacture = ctx.typesFacture[Number(c.touche) - 1]?.type;
  return annonces;
}

// Un numéro hors du carnet n'a pas de nom : une phrase à nom ({name}) ne le prend jamais à la place d'un nom
const sansNom = (b: Brouillon) => !b.nom || b.nom === telephone(b.telephone || '');

// Tant que le récapitulatif n'a pas de traduction validée : les mêmes valeurs ligne à ligne, chaque ligne déjà
// validée (« Total à débiter », avant l'opération). Montant, bénéficiaire, frais et total y sont tous.
function lignesRecap(b: Brouillon, frais: number, total: number): Morceau[] {
  const envoi = sansNom(b) ? r('RF131', { amount: montant(b.montant!) }) : r('RF130', { amount: montant(b.montant!), name: b.nom! });
  return [envoi, r('RF132', { phone: telephone(b.telephone!) }), r('RF133', { amount: montant(frais) }), r('RF134', { amount: montant(total) })];
}

// Un bénéficiaire désigné sans ambiguïté met fin à tout choix en cours entre homonymes
function definir(s: Session, b: Brouillon, contact: Contact) {
  s.candidats = [];
  b.nom = contact.nom;
  b.telephone = contact.telephone;
  b.type = contact.type as TypeEnvoi;
}

function refus(raison: Refus, valeurs: { solde: number; total: number; plafond: number }): Morceau[] {
  if (raison === 'solde_insuffisant') {
    return [r('RF060', { amount: montant(valeurs.solde), amount_2: montant(valeurs.total) }), r('RF061', { amount: montant(valeurs.total - valeurs.solde) })];
  }
  if (raison === 'plafond_depasse') return [r('RF062', { amount: montant(valeurs.plafond) })];
  if (raison === 'facture_inconnue') return [r('RF094')];
  if (raison === 'facture_payee') return [r('RF095')];
  return [r('RF054')];
}

// La banque prépare l'opération (en attente, rien n'est débité) ; une correction garde la même opération, sauf si
// elle a expiré entre-temps
async function preparer(ctx: Contexte, b: Brouillon, demande: Demande): Promise<Preparation> {
  let preparation = b.transaction ? await ctx.banque.modifier(b.transaction, demande) : await ctx.banque.preparer(demande);
  if (!preparation.ok && preparation.refus === 'operation_expiree') {
    b.transaction = undefined;
    preparation = await ctx.banque.preparer(demande);
  }
  if (preparation.ok) { b.transaction = preparation.id; b.frais = preparation.frais; }
  return preparation;
}

const enAttente = (b: Brouillon, id: string): Transaction => ({ id, etat: 'attente' });

async function refuser(ctx: Contexte, s: Session, raison: Refus, b: Brouillon, parametres: Record<string, unknown>): Promise<Decision> {
  const validation = `refusée avant exécution : ${raison.replaceAll('_', ' ')}`;
  // Un numéro que la banque ne connaît pas : on redemande le bénéficiaire, sans perdre le montant
  if (raison === 'beneficiaire_inconnu') {
    const precision = sansNom(b) ? r('RF063') : r('RF057');
    Object.assign(b, { telephone: undefined, nom: undefined });
    s.attente = 'beneficiaire';
    return { morceaux: [precision], statut: 'refusee', validation, parametres };
  }
  if (raison === 'operation_expiree') { oublier(s); return { morceaux: [r('RF065')], statut: 'refusee', validation, parametres }; }
  const frais = b.intention === 'transfert' && b.montant !== undefined ? await ctx.banque.frais(b.montant, b.type || 'mobile') : 0;
  const valeurs = { solde: await ctx.banque.solde(), total: (b.montant || 0) + frais, plafond: await ctx.banque.plafond() };
  // L'opération reste ouverte sur le montant : la personne peut proposer une somme plus petite
  if (raison === 'solde_insuffisant' || raison === 'plafond_depasse' || raison === 'montant_invalide') s.attente = 'montant';
  else oublier(s);
  return { morceaux: refus(raison, valeurs), statut: 'refusee', validation, parametres: { ...parametres, frais, total: valeurs.total } };
}

async function avancerTransfert(ctx: Contexte, s: Session, b: Brouillon): Promise<Decision> {
  if (b.montant === undefined) { s.attente = 'montant'; return question([b.nom && !s.candidats.length && !sansNom(b) ? r('RF051', { name: b.nom }) : r('RF030')], 'montant demandé'); }
  if (s.candidats.length) {
    s.attente = 'choix_contact';
    const liste = s.candidats.map((c, i): Morceau => ({ fait: `${i + 1}. ${c.nom}, ${telephone(c.telephone)}` }));
    return question([r('RF050', { name: b.nom! }), ...liste], 'contact ambigu : choix demandé');
  }
  if (!b.telephone) { s.attente = 'beneficiaire'; return question([{ ...r('RF052', { amount: montant(b.montant) }), repli: r('RF031') }], 'bénéficiaire demandé'); }
  if (s.relais) return pret(s, { intention: 'transfert', montant: b.montant, telephone: b.telephone }, { montant: b.montant, beneficiaire: b.nom, telephone: b.telephone });
  const parametres = { montant: b.montant, beneficiaire: b.nom, telephone: b.telephone, type: b.type };
  const p = await preparer(ctx, b, { intention: 'transfert', montant: b.montant, telephone: b.telephone, nom: b.nom!, type: b.type || 'mobile' });
  if (!p.ok) return refuser(ctx, s, p.refus, b, parametres);
  s.attente = 'confirmation';
  const valeurs = { amount: montant(b.montant), phone: telephone(b.telephone), fee: montant(p.frais), amount_2: montant(p.total) };
  const recap = sansNom(b) ? r('RF037', valeurs) : r('RF032', { ...valeurs, name: b.nom! });
  return {
    morceaux: [{ ...recap, repli: lignesRecap(b, p.frais, p.total), court: lignesRecap(b, p.frais, p.total) }, confirmer()],
    statut: 'en_attente_confirmation', validation: 'récapitulatif présenté, confirmation demandée',
    operation: { intention: 'transfert', montant: b.montant, telephone: b.telephone }, parametres: { ...parametres, frais: p.frais, total: p.total },
    transaction: enAttente(b, p.id),
  };
}

async function avancerCredit(ctx: Contexte, s: Session, b: Brouillon): Promise<Decision> {
  if (b.montant === undefined) { s.attente = 'montant'; return question([r('RF083')], 'montant demandé'); }
  if (!b.telephone) b.telephone = s.relais?.appelant || (await ctx.banque.client()).telephone;
  if (s.relais) return pret(s, { intention: 'credit', montant: b.montant, telephone: b.telephone }, { montant: b.montant, telephone: b.telephone });
  const parametres = { montant: b.montant, telephone: b.telephone, total: b.montant };
  const p = await preparer(ctx, b, { intention: 'credit', montant: b.montant, telephone: b.telephone });
  if (!p.ok) return refuser(ctx, s, p.refus, b, parametres);
  s.attente = 'confirmation';
  return {
    morceaux: [r('RF081', { amount: montant(b.montant), phone: telephone(b.telephone) }), confirmer()],
    statut: 'en_attente_confirmation', validation: 'récapitulatif présenté, confirmation demandée',
    operation: { intention: 'credit', montant: b.montant, telephone: b.telephone }, parametres: { ...parametres, total: p.total },
    transaction: enAttente(b, p.id),
  };
}

async function avancerFacture(ctx: Contexte, s: Session, b: Brouillon): Promise<Decision> {
  const factures = await ctx.banque.factures();
  const facture = b.facture ? factures.find((f) => f.numero === b.facture)
    : b.typeFacture ? factures.find((f) => f.type === b.typeFacture && !f.payee) : undefined;
  if (!facture && !b.facture && !b.typeFacture) {
    s.attente = 'type_facture';
    const liste = ctx.typesFacture.map((t, i): Morceau => ({ ref: t.ref, prefixe: `${i + 1}. ` }));
    return question([r('RF090'), ...liste], 'type de facture demandé');
  }
  if (!facture) { oublier(s); return { morceaux: [r('RF094')], statut: 'refusee', validation: 'facture introuvable', parametres: { facture: b.facture, type: b.typeFacture } }; }
  if (facture.payee) { oublier(s); return { morceaux: [r('RF095')], statut: 'refusee', validation: 'facture déjà payée', parametres: { facture: facture.numero } }; }
  b.facture = facture.numero;
  b.montant = facture.montant;
  const parametres = { facture: facture.numero, type: facture.type, montant: facture.montant, total: facture.montant };
  const p = await preparer(ctx, b, { intention: 'facture', montant: facture.montant, facture: facture.numero });
  if (!p.ok) return refuser(ctx, s, p.refus, b, parametres);
  s.attente = 'confirmation';
  return {
    morceaux: [r('RF092', { ref: facture.numero, amount: montant(facture.montant) }), confirmer()],
    statut: 'en_attente_confirmation', validation: 'récapitulatif présenté, confirmation demandée',
    operation: { intention: 'facture', montant: facture.montant, facture: facture.numero }, parametres: { ...parametres, total: p.total },
    transaction: enAttente(b, p.id),
  };
}

const AVANCER = { transfert: avancerTransfert, credit: avancerCredit, facture: avancerFacture };

// Service relayé : l'opération complète part au service, qui récapitule, fait confirmer et exécute avec ses écrans
function pret(s: Session, operation: Operation, parametres: Record<string, unknown>): Decision {
  oublier(s);
  return { morceaux: [], statut: 'en_attente_confirmation', validation: 'opération complète, relayée au service qui récapitule et fait confirmer', operation, parametres, pret: operation };
}

const ESSAIS_MAX = 3;
const etatDe = (s: Session) => JSON.stringify([s.attente, s.brouillon, s.candidats.map((k) => k.id)]);

// Une réponse qui n'apporte rien à la question posée : une question plus précise, toujours validée, plutôt que la
// même. À la troisième réponse sans suite, rien n'est fait : on le dit et on rappelle ce que Mayem sait faire.
async function relancer(ctx: Contexte, s: Session, texte: string): Promise<Decision> {
  s.essais += 1;
  if (s.essais >= ESSAIS_MAX) {
    oublier(s);
    return { morceaux: [r('RF056'), r('RF110')], statut: 'annulee', validation: `${ESSAIS_MAX} réponses sans suite : abandonnée, rien exécuté` };
  }
  if (s.attente === 'montant') return question([r('RF054')], 'montant non compris : redemandé');
  if (s.attente === 'beneficiaire') {
    // Des chiffres qui ne font pas un numéro, ou un nom absent du carnet : on dit lequel des deux
    const precision = /\d/.test(texte) ? r('RF063') : /\p{L}/u.test(texte) ? r('RF057') : r('RF031');
    return question([precision], 'bénéficiaire non compris : précision demandée');
  }
  if (s.attente === 'confirmation') return question([confirmer()], 'confirmation redemandée');
  return { ...(await AVANCER[s.brouillon!.intention](ctx, s, s.brouillon!)), validation: 'réponse sans suite : choix redemandé' };
}

const operationDe = (b: Brouillon): Operation =>
  ({ intention: b.intention, montant: b.montant!, ...(b.facture ? { facture: b.facture } : { telephone: b.telephone }) });

// Tant que la phrase n'a pas de traduction validée : « Transfert effectué » et la référence, deux lignes validées
function transfertFait(b: Brouillon, reference: string): Morceau {
  const fait = sansNom(b) ? r('RF038', { amount: montant(b.montant!), phone: telephone(b.telephone!), ref: reference })
    : r('RF034', { name: b.nom!, amount: montant(b.montant!), ref: reference });
  return { ...fait, repli: [r('RF135'), r('RF136', { ref: reference })] };
}

async function executer(ctx: Contexte, s: Session): Promise<Decision> {
  const b = s.brouillon!;
  const operation = operationDe(b);
  const id = b.transaction!;
  const resultat = await ctx.banque.confirmer(id);
  const parametres = { montant: b.montant, beneficiaire: b.nom, telephone: b.telephone, facture: b.facture, frais: b.frais };
  if (!resultat.ok) return { ...(await refuser(ctx, s, resultat.refus, b, parametres)), operation };
  const fin = r('RF035', { amount: montant(resultat.solde) });
  const morceaux = b.intention === 'transfert' ? [transfertFait(b, resultat.reference), fin]
    : b.intention === 'credit' ? [r('RF082', { amount: montant(b.montant!), phone: telephone(b.telephone!) }), fin]
      : [r('RF093', { amount: montant(b.montant!), ref: resultat.reference }), fin];
  oublier(s);
  return { morceaux, statut: 'executee', validation: `confirmée par l'utilisateur, exécutée (${resultat.reference})`, operation,
    parametres: { ...parametres, reference: resultat.reference }, transaction: { id, etat: 'executee' } };
}

async function solde(ctx: Contexte, c: Comprehension): Promise<Decision> {
  const disponible = await ctx.banque.solde();
  const vise = dernier(c.montants);
  const morceaux = [r('RF010', { amount: montant(disponible) })];
  if (vise) morceaux.push(disponible >= vise.valeur ? r('RF012', { amount: montant(disponible - vise.valeur) }) : r('RF061', { amount: montant(vise.valeur - disponible) }));
  return { ...info(morceaux), parametres: { solde: disponible, ...(vise ? { montant: vise.valeur } : {}) } };
}

const JOURS: Record<string, number> = { jour: 0, hier: 1, semaine: 6, mois: 30 };
function dansPeriode(jour: string, aujourdhui: string, periode: string) {
  const ecart = (Date.parse(aujourdhui) - Date.parse(jour)) / 86400000;
  return periode === 'hier' ? ecart === 1 : periode === 'mois' ? jour.slice(0, 7) === aujourdhui.slice(0, 7) : ecart >= 0 && ecart <= JOURS[periode];
}

async function depenses(ctx: Contexte, c: Comprehension): Promise<Decision> {
  const periode = c.periode || 'semaine';
  const aujourdhui = await ctx.banque.aujourdhui();
  const total = (await ctx.banque.historique())
    .filter((m) => m.type !== 'recu' && dansPeriode(m.date, aujourdhui, periode))
    .reduce((somme, m) => somme + m.montant, 0);
  const ref = { jour: 'RF014', hier: 'RF015', semaine: 'RF016', mois: 'RF017' }[periode] || 'RF016';
  return { ...info([r(ref, { amount: montant(total) })]), parametres: { periode, total } };
}

const LIGNES: Record<string, string> = { envoi: 'RF021', recu: 'RF022', credit: 'RF023', facture: 'RF024' };

// maximum : nombre d'opérations qu'un écran peut montrer
async function historique(ctx: Contexte, c: Comprehension, maximum: number): Promise<Decision> {
  let mouvements = await ctx.banque.historique();
  const qui = dernier(c.contacts);
  if (qui) {
    const arrive = mouvements.find((m) => m.type === 'recu' && qui.contacts.some((k) => k.id === m.contact));
    return arrive
      ? { ...info([r('RF026', { name: arrive.nom, amount: montant(arrive.montant), date: date(arrive.date) })]), parametres: { contact: arrive.nom } }
      : { ...info([r('RF025')]), parametres: { contact: qui.contacts.map((k) => k.nom) } };
  }
  if (c.periode) {
    const aujourdhui = await ctx.banque.aujourdhui();
    mouvements = mouvements.filter((m) => dansPeriode(m.date, aujourdhui, c.periode!));
  }
  const nombre = Math.min(maximum, Math.max(1, c.nombres[0]?.valeur || 3));
  const choisis = mouvements.slice(0, nombre);
  if (!choisis.length) return info([r('RF025')]);
  const lignes = choisis.map((m) => r(LIGNES[m.type], { date: date(m.date), amount: montant(m.montant), name: m.nom }));
  return { ...info([r('RF020', { count: String(choisis.length) }), ...lignes]), parametres: { nombre: choisis.length, periode: c.periode } };
}

// court : sur un écran USSD, le barème sans la définition (« expliquer les frais » la donne), sans la mention des envois gratuits
async function frais(ctx: Contexte, c: Comprehension, court: boolean): Promise<Decision> {
  const vise = dernier(c.montants);
  const mention = dernier(c.contacts);
  const contact = mention && mention.contacts.length === 1 ? mention.contacts[0] : undefined;
  if (!vise) {
    const bareme = await ctx.banque.bareme('mobile');
    const tarif = bareme ? [r('RF072', { percent: pourcentage(bareme.taux), amount: montant(bareme.min), amount_2: montant(bareme.max) })] : [];
    const gratuit = (await ctx.banque.bareme('interne'))?.taux === 0 ? [r('RF071')] : [];
    return info([...(court && tarif.length ? [] : [r('RF073')]), ...tarif, ...gratuit]);
  }
  const type = (contact?.type as TypeEnvoi) || 'mobile';
  const cout = await ctx.banque.frais(vise.valeur, type);
  const morceaux = [r('RF070', { amount: montant(vise.valeur), fee: montant(cout), amount_2: montant(vise.valeur + cout) })];
  if (!contact && !court && (await ctx.banque.bareme('interne'))?.taux === 0) morceaux.push(r('RF071'));
  return { ...info(morceaux), parametres: { montant: vise.valeur, type, frais: cout, total: vise.valeur + cout, ...(contact ? { beneficiaire: contact.nom } : {}) } };
}

async function nouvelleOperation(ctx: Contexte, s: Session, intention: IntentionArgent, c: Comprehension): Promise<Decision> {
  oublier(s);
  s.brouillon = { intention };
  await completer(ctx, s, s.brouillon, c);
  return AVANCER[intention](ctx, s, s.brouillon);
}

function changerLangue(ctx: Contexte, s: Session, c: Comprehension): Decision {
  const vers = c.langue === 'fr' ? 'fr' : ctx.nationale.code;
  s.langue = vers;
  // En français, un nom de langue s'écrit en minuscules : « nous continuons en bulu »
  const morceaux = [r('RF100', { langue: vers === 'fr' ? 'français' : ctx.nationale.nom.toLowerCase() })];
  if (!s.attente) return { ...info(morceaux, `langue changée : ${vers}`), parametres: { langue: vers } };
  // Une opération en cours reprend là où elle en était, dans la nouvelle langue, avec la même empreinte
  const enConfirmation = s.attente === 'confirmation' && s.brouillon;
  return {
    morceaux: [...annonces(s, morceaux), ...s.derniere],
    statut: enConfirmation ? 'en_attente_confirmation' : 'clarification',
    validation: `langue changée : ${vers} ; opération en cours reprise`,
    parametres: { langue: vers },
    ...(enConfirmation ? { operation: operationDe(s.brouillon!) } : {}),
  };
}

// Réponse à la demande, selon l'état de la conversation
async function decider(ctx: Contexte, s: Session, c: Comprehension, texte: string): Promise<Decision> {
  if (c.intention === 'annuler' || (c.intention === 'non' && s.attente && s.attente !== 'confirmation')) {
    const enCours = Boolean(s.brouillon);
    oublier(s);
    return enCours ? { morceaux: [r('RF066')], statut: 'annulee', validation: 'annulée par l\'utilisateur' } : info([r('RF068')]);
  }
  if (c.intention === 'langue' && c.langue) return changerLangue(ctx, s, c);
  // « N'envoie pas 5 000, envoie 10 000 » pendant une opération est une correction : la négation n'annule que si
  // aucune nouvelle valeur n'est gardée
  const corrige = Boolean(s.brouillon) && apporteValeur(c);
  if (c.negation && !corrige && (ARGENT.has(c.intention || '') || (s.brouillon && !c.intention))) {
    oublier(s);
    return { morceaux: [{ ...r('RF067'), repli: r('RF066') }], statut: 'annulee', validation: 'demande négative : rien exécuté' };
  }
  if (s.attente === 'confirmation' && s.brouillon) {
    if (apporteValeur(c)) return corriger(ctx, s, c, texte);
    if (c.intention === 'oui' || c.touche === '1') return executer(ctx, s);
    if (c.intention === 'non' || c.touche === '2') { oublier(s); return { morceaux: [r('RF066')], statut: 'annulee', validation: 'refusée par l\'utilisateur' }; }
    if (c.intention === 'corriger') { s.attente = s.brouillon.intention === 'facture' ? 'type_facture' : 'beneficiaire'; return question([r('RF044')], 'correction : nouvelle valeur demandée'); }
    if (c.intention === 'repeter') return question([...annonces(s, [r('RF111')]), ...s.derniere], 'confirmation redemandée');
    if (!c.intention) return relancer(ctx, s, texte);
  } else if (s.attente && s.brouillon && (!c.intention || SANS_CONTEXTE.has(c.intention) || c.intention === s.brouillon.intention)) {
    // À « À qui ? », des chiffres seuls qui ne font pas un numéro sont un numéro mal tapé, pas un nouveau montant
    if (s.attente === 'beneficiaire' && /^[\d\s+]+$/.test(texte) && !dernier(c.telephones)) return relancer(ctx, s, texte);
    const avant = etatDe(s);
    const corrections = await completer(ctx, s, s.brouillon, c, texte);
    if (!corrections.length && etatDe(s) === avant) return relancer(ctx, s, texte);
    s.essais = 0;
    const suite = await AVANCER[s.brouillon.intention](ctx, s, s.brouillon);
    return { ...suite, morceaux: [...annonces(s, corrections), ...suite.morceaux] };
  }
  return nouvelleDemande(ctx, s, c);
}

async function corriger(ctx: Contexte, s: Session, c: Comprehension, texte: string): Promise<Decision> {
  const corrections = await completer(ctx, s, s.brouillon!, c, texte);
  const suite = await AVANCER[s.brouillon!.intention](ctx, s, s.brouillon!);
  return { ...suite, morceaux: [...annonces(s, corrections), ...suite.morceaux], validation: `corrigée avant exécution ; ${suite.validation}` };
}

async function nouvelleDemande(ctx: Contexte, s: Session, c: Comprehension): Promise<Decision> {
  const intention = c.intention;
  if (intention && ARGENT.has(intention)) return nouvelleOperation(ctx, s, intention as IntentionArgent, c);
  oublier(s);
  switch (intention) {
    case 'solde': return solde(ctx, c);
    case 'historique': return historique(ctx, c, ecranCourt(s) ? 2 : 10);
    case 'depenses': return depenses(ctx, c);
    case 'frais': return frais(ctx, c, ecranCourt(s));
    case 'expliquer': return c.terme ? info([r(c.terme.ref)], `terme expliqué : ${c.terme.terme}`) : question([r('RF056')], 'terme non reconnu');
    case 'aide': return info([r('RF110')]);
    // Chaque langue s'annonce sous son propre nom, qui ne se traduit pas : c'est l'usage de tout choix de langue
    case 'langue': return question([r('RF102'), { fait: '1. Français' }, { fait: `2. ${ctx.nationale.nom}` }], 'choix de la langue demandé');
    case 'repeter': return info([...annonces(s, [r('RF111')]), ...s.derniere], 'dernière réponse répétée');
    case 'saluer': return info([r('RF001', { name: (await ctx.banque.client()).prenom })]);
    case 'terminer': return info([r('RF112')]);
    case 'oui': case 'non': case 'corriger': return info([r('RF068')]);
  }
  // Une intention comprise que la banque branchée ne propose pas : le dire, plutôt que « je n'ai pas compris »
  if (intention) return info([r('RF120')], `intention comprise sans opération correspondante ici : ${intention}`);
  if (c.hesitation.includes('transfert') && c.hesitation.includes('credit')) return question([r('RF053')], `hésitation : ${c.hesitation.join(' ou ')}`);
  return question([r('RF056')], c.hesitation.length ? `hésitation : ${c.hesitation.join(' ou ')}` : 'demande non comprise');
}

export async function traiter(ctx: Contexte, s: Session, texte: string): Promise<Tour> {
  const debut = performance.now();
  const c = comprendre(texte, { lexiques: ctx.lexiques, carnet: await ctx.banque.carnet(), termes: ctx.termes });
  let decision: Decision;
  const erreurs: string[] = [];
  const enCours = s.brouillon?.transaction;
  try {
    decision = await decider(ctx, s, c, texte);
  } catch (e) {
    // Une panne ne laisse jamais une opération à moitié faite : on oublie tout et on le dit
    oublier(s);
    erreurs.push(e instanceof Error ? e.message : String(e));
    decision = { morceaux: [r('RF064')], statut: 'erreur', validation: 'erreur technique : rien exécuté' };
  }
  if (enCours && s.brouillon?.transaction !== enCours && decision.statut !== 'executee') {
    await ctx.banque.annuler(enCours).catch((e) => erreurs.push(e instanceof Error ? e.message : String(e)));
    decision = { ...decision, transaction: { id: enCours, etat: 'annulee' } };
  }
  const rendus = decision.morceaux.map((m) => ctx.reponses.rendre(m, s.langue, s.canal));
  if (c.intention !== 'repeter' || !s.derniere.length) s.derniere = decision.morceaux.filter((m) => !('ref' in m && (m.ref === 'RF111' || m.ref === 'RF100')));
  const empreinte = decision.operation ? await empreinteOperation(decision.operation) : null;
  const journal = ligneJournal({ session: s, comprehension: c, decision, rendus, empreinte, erreurs, duree: performance.now() - debut });
  return { texte: rendus.map((x) => x.texte).join('\n'), rendus, journal, ...(decision.pret ? { pret: decision.pret } : {}),
    ...(decision.transaction ? { transaction: decision.transaction } : {}) };
}
