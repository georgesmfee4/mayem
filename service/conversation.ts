// Le noyau conversationnel : une demande arrive d'un canal (application, web, USSD, SMS, voix, guichet), Mayem la
// comprend, pose une question s'il manque quelque chose ou s'il doute, fait confirmer avant tout mouvement
// d'argent, exécute auprès de la banque et répond avec des phrases validées. Chaque tour laisse une ligne de
// journal aux colonnes du tableau de bord du jury. Les canaux ne font que transporter le texte.
//
// Trois règles tiennent tout le reste :
// - rien ne part sans un « oui » à un récapitulatif qui redit montant, bénéficiaire, frais et total ;
// - dans le doute (intention faible, valeur manquante, contact ambigu, négation), on demande, on ne devine pas ;
// - l'état de l'opération ne dépend pas de la langue : on peut changer de langue au milieu sans rien perdre.

import { comprendre, type Comprehension, type Contact, type Lexique, type Terme } from '../core/comprendre.ts';
import { empreinteOperation, type Operation } from '../core/operation.ts';
import type { Banque, Refus, Resultat, TypeEnvoi } from './banque.ts';
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

export interface Tour { texte: string; rendus: Rendu[]; journal: LigneJournal }

interface Decision {
  morceaux: Morceau[];
  statut: Statut;
  validation: string;
  operation?: Operation;
  parametres?: Record<string, unknown>;
}

const ARGENT = new Set(['transfert', 'credit', 'facture']);
const SANS_CONTEXTE = new Set(['oui', 'non', 'corriger']);

export function nouvelleSession(id: string, canal: string, langue: string): Session {
  return { id, canal, langue, attente: null, brouillon: null, candidats: [], derniere: [] };
}

const r = (ref: string, valeurs?: Record<string, string>): Morceau => (valeurs ? { ref, valeurs } : { ref });
const info = (morceaux: Morceau[], validation = 'information donnée'): Decision => ({ morceaux, statut: 'information', validation });
const question = (morceaux: Morceau[], validation: string): Decision => ({ morceaux, statut: 'clarification', validation });

function oublier(s: Session) {
  s.attente = null;
  s.brouillon = null;
  s.candidats = [];
}

// Les valeurs que la personne garde (une valeur écartée, « pas 5 000 », ne compte pas) : la dernière dite gagne
const dernier = <T extends { rejete: boolean }>(liste: T[]): T | undefined => liste.filter((v) => !v.rejete).pop();
const apporteValeur = (c: Comprehension) =>
  Boolean(dernier(c.montants) || dernier(c.contacts) || dernier(c.telephones) || c.facture || c.typeFacture);

async function contactDuNumero(ctx: Contexte, numero: string) {
  return (await ctx.banque.carnet()).find((c) => c.telephone === numero);
}

// Reporte dans le brouillon ce que la demande apporte ; rend les corrections faites, pour les annoncer
async function completer(ctx: Contexte, s: Session, b: Brouillon, c: Comprehension): Promise<Morceau[]> {
  const annonces: Morceau[] = [];
  const somme = dernier(c.montants);
  if (somme) {
    if (b.montant !== undefined && b.montant !== somme.valeur) annonces.push(r('RF040', { amount: montant(somme.valeur), amount_2: montant(b.montant) }));
    b.montant = somme.valeur;
  }
  const choisi = s.attente === 'choix_contact' && c.touche ? s.candidats[Number(c.touche) - 1] : undefined;
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

// Vérifie ce que la banque refuserait, avant de demander une confirmation inutile
async function controler(ctx: Contexte, total: number, somme: number): Promise<Refus | null> {
  if (!Number.isFinite(somme) || somme <= 0) return 'montant_invalide';
  if (somme > await ctx.banque.plafond()) return 'plafond_depasse';
  if (total > await ctx.banque.solde()) return 'solde_insuffisant';
  return null;
}

async function refuser(ctx: Contexte, s: Session, raison: Refus, total: number, parametres: Record<string, unknown>): Promise<Decision> {
  const valeurs = { solde: await ctx.banque.solde(), total, plafond: await ctx.banque.plafond() };
  // L'opération reste ouverte sur le montant : la personne peut proposer une somme plus petite
  if (raison === 'solde_insuffisant' || raison === 'plafond_depasse' || raison === 'montant_invalide') s.attente = 'montant';
  else oublier(s);
  return { morceaux: refus(raison, valeurs), statut: 'refusee', validation: `refusée avant exécution : ${raison.replaceAll('_', ' ')}`, parametres };
}

async function avancerTransfert(ctx: Contexte, s: Session, b: Brouillon): Promise<Decision> {
  if (b.montant === undefined) { s.attente = 'montant'; return question([b.nom && !s.candidats.length ? r('RF051', { name: b.nom }) : r('RF030')], 'montant demandé'); }
  if (s.candidats.length) {
    s.attente = 'choix_contact';
    const liste = s.candidats.map((c, i): Morceau => ({ fait: `${i + 1}. ${c.nom}, ${telephone(c.telephone)}` }));
    return question([r('RF050', { name: b.nom! }), ...liste], 'contact ambigu : choix demandé');
  }
  if (!b.telephone) { s.attente = 'beneficiaire'; return question([r('RF052', { amount: montant(b.montant) })], 'bénéficiaire demandé'); }
  const frais = await ctx.banque.frais(b.montant, b.type || 'mobile');
  const total = b.montant + frais;
  const parametres = { montant: b.montant, beneficiaire: b.nom, telephone: b.telephone, type: b.type, frais, total };
  const probleme = await controler(ctx, total, b.montant);
  if (probleme) return refuser(ctx, s, probleme, total, parametres);
  b.frais = frais;
  s.attente = 'confirmation';
  return {
    morceaux: [r('RF032', { amount: montant(b.montant), name: b.nom!, phone: telephone(b.telephone), fee: montant(frais), amount_2: montant(total) }), r('RF033')],
    statut: 'en_attente_confirmation', validation: 'récapitulatif présenté, confirmation demandée',
    operation: { intention: 'transfert', montant: b.montant, telephone: b.telephone }, parametres,
  };
}

async function avancerCredit(ctx: Contexte, s: Session, b: Brouillon): Promise<Decision> {
  if (b.montant === undefined) { s.attente = 'montant'; return question([r('RF083')], 'montant demandé'); }
  if (!b.telephone) b.telephone = (await ctx.banque.client()).telephone;
  const parametres = { montant: b.montant, telephone: b.telephone, total: b.montant };
  const probleme = await controler(ctx, b.montant, b.montant);
  if (probleme) return refuser(ctx, s, probleme, b.montant, parametres);
  s.attente = 'confirmation';
  return {
    morceaux: [r('RF081', { amount: montant(b.montant), phone: telephone(b.telephone) }), r('RF033')],
    statut: 'en_attente_confirmation', validation: 'récapitulatif présenté, confirmation demandée',
    operation: { intention: 'credit', montant: b.montant, telephone: b.telephone }, parametres,
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
  const probleme = await controler(ctx, facture.montant, facture.montant);
  if (probleme) return refuser(ctx, s, probleme, facture.montant, parametres);
  s.attente = 'confirmation';
  return {
    morceaux: [r('RF092', { ref: facture.numero, amount: montant(facture.montant) }), r('RF033')],
    statut: 'en_attente_confirmation', validation: 'récapitulatif présenté, confirmation demandée',
    operation: { intention: 'facture', montant: facture.montant, facture: facture.numero }, parametres,
  };
}

const AVANCER = { transfert: avancerTransfert, credit: avancerCredit, facture: avancerFacture };

const operationDe = (b: Brouillon): Operation =>
  ({ intention: b.intention, montant: b.montant!, ...(b.facture ? { facture: b.facture } : { telephone: b.telephone }) });

async function executer(ctx: Contexte, s: Session): Promise<Decision> {
  const b = s.brouillon!;
  const operation = operationDe(b);
  let resultat: Resultat;
  if (b.intention === 'transfert') resultat = await ctx.banque.transferer({ montant: b.montant!, telephone: b.telephone!, nom: b.nom!, type: b.type || 'mobile' });
  else if (b.intention === 'credit') resultat = await ctx.banque.acheterCredit({ montant: b.montant!, telephone: b.telephone! });
  else resultat = await ctx.banque.payerFacture(b.facture!);
  const parametres = { montant: b.montant, beneficiaire: b.nom, telephone: b.telephone, facture: b.facture, frais: b.frais };
  if (!resultat.ok) return { ...(await refuser(ctx, s, resultat.refus, b.montant! + (b.frais || 0), parametres)), operation };
  const fin = r('RF035', { amount: montant(resultat.solde) });
  const morceaux = b.intention === 'transfert' ? [r('RF034', { name: b.nom!, amount: montant(b.montant!), ref: resultat.reference }), fin]
    : b.intention === 'credit' ? [r('RF082', { amount: montant(b.montant!), phone: telephone(b.telephone!) }), fin]
      : [r('RF093', { amount: montant(b.montant!), ref: resultat.reference }), fin];
  oublier(s);
  return { morceaux, statut: 'executee', validation: `confirmée par l'utilisateur, exécutée (${resultat.reference})`, operation, parametres: { ...parametres, reference: resultat.reference } };
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

async function historique(ctx: Contexte, c: Comprehension): Promise<Decision> {
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
  const nombre = Math.min(10, Math.max(1, c.nombres[0]?.valeur || 3));
  const choisis = mouvements.slice(0, nombre);
  if (!choisis.length) return info([r('RF025')]);
  const lignes = choisis.map((m) => r(LIGNES[m.type], { date: date(m.date), amount: montant(m.montant), name: m.nom }));
  return { ...info([r('RF020', { count: String(choisis.length) }), ...lignes]), parametres: { nombre: choisis.length, periode: c.periode } };
}

async function frais(ctx: Contexte, c: Comprehension): Promise<Decision> {
  const vise = dernier(c.montants);
  const mention = dernier(c.contacts);
  const contact = mention && mention.contacts.length === 1 ? mention.contacts[0] : undefined;
  if (!vise) {
    const bareme = await ctx.banque.bareme('mobile');
    return info([r('RF073'), r('RF072', { percent: pourcentage(bareme.taux), amount: montant(bareme.min), amount_2: montant(bareme.max) }), r('RF071')]);
  }
  const type = (contact?.type as TypeEnvoi) || 'mobile';
  const cout = await ctx.banque.frais(vise.valeur, type);
  const morceaux = [r('RF070', { amount: montant(vise.valeur), fee: montant(cout), amount_2: montant(vise.valeur + cout) })];
  if (!contact) morceaux.push(r('RF071'));
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
    morceaux: [...morceaux, ...s.derniere],
    statut: enConfirmation ? 'en_attente_confirmation' : 'clarification',
    validation: `langue changée : ${vers} ; opération en cours reprise`,
    parametres: { langue: vers },
    ...(enConfirmation ? { operation: operationDe(s.brouillon!) } : {}),
  };
}

// Réponse à la demande, selon l'état de la conversation
async function decider(ctx: Contexte, s: Session, c: Comprehension): Promise<Decision> {
  if (c.intention === 'annuler') {
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
    return { morceaux: [r('RF067')], statut: 'annulee', validation: 'demande négative : rien exécuté' };
  }
  if (s.attente === 'confirmation' && s.brouillon) {
    if (apporteValeur(c)) return corriger(ctx, s, c);
    if (c.intention === 'oui' || c.touche === '1') return executer(ctx, s);
    if (c.intention === 'non' || c.touche === '2') { oublier(s); return { morceaux: [r('RF066')], statut: 'annulee', validation: 'refusée par l\'utilisateur' }; }
    if (c.intention === 'corriger') { s.attente = s.brouillon.intention === 'facture' ? 'type_facture' : 'beneficiaire'; return question([r('RF044')], 'correction : nouvelle valeur demandée'); }
    if (!c.intention || c.intention === 'repeter') return question(c.intention === 'repeter' ? [r('RF111'), ...s.derniere] : [r('RF033')], 'confirmation redemandée');
  } else if (s.attente && s.brouillon && (!c.intention || SANS_CONTEXTE.has(c.intention) || c.intention === s.brouillon.intention)) {
    const annonces = await completer(ctx, s, s.brouillon, c);
    const suite = await AVANCER[s.brouillon.intention](ctx, s, s.brouillon);
    return { ...suite, morceaux: [...annonces, ...suite.morceaux] };
  }
  return nouvelleDemande(ctx, s, c);
}

async function corriger(ctx: Contexte, s: Session, c: Comprehension): Promise<Decision> {
  const annonces = await completer(ctx, s, s.brouillon!, c);
  const suite = await AVANCER[s.brouillon!.intention](ctx, s, s.brouillon!);
  return { ...suite, morceaux: [...annonces, ...suite.morceaux], validation: `corrigée avant exécution ; ${suite.validation}` };
}

async function nouvelleDemande(ctx: Contexte, s: Session, c: Comprehension): Promise<Decision> {
  const intention = c.intention;
  if (intention && ARGENT.has(intention)) return nouvelleOperation(ctx, s, intention as IntentionArgent, c);
  oublier(s);
  switch (intention) {
    case 'solde': return solde(ctx, c);
    case 'historique': return historique(ctx, c);
    case 'depenses': return depenses(ctx, c);
    case 'frais': return frais(ctx, c);
    case 'expliquer': return c.terme ? info([r(c.terme.ref)], `terme expliqué : ${c.terme.terme}`) : question([r('RF056')], 'terme non reconnu');
    case 'aide': return info([r('RF110')]);
    // Chaque langue s'annonce sous son propre nom, qui ne se traduit pas : c'est l'usage de tout choix de langue
    case 'langue': return question([r('RF102'), { fait: '1. Français' }, { fait: `2. ${ctx.nationale.nom}` }], 'choix de la langue demandé');
    case 'repeter': return info([r('RF111'), ...s.derniere], 'dernière réponse répétée');
    case 'saluer': return info([r('RF001', { name: (await ctx.banque.client()).prenom })]);
    case 'terminer': return info([r('RF112')]);
    case 'oui': case 'non': case 'corriger': return info([r('RF068')]);
  }
  if (c.hesitation.includes('transfert') && c.hesitation.includes('credit')) return question([r('RF053')], `hésitation : ${c.hesitation.join(' ou ')}`);
  return question([r('RF056')], c.hesitation.length ? `hésitation : ${c.hesitation.join(' ou ')}` : 'demande non comprise');
}

export async function traiter(ctx: Contexte, s: Session, texte: string): Promise<Tour> {
  const debut = performance.now();
  const c = comprendre(texte, { lexiques: ctx.lexiques, carnet: await ctx.banque.carnet(), termes: ctx.termes });
  let decision: Decision;
  const erreurs: string[] = [];
  try {
    decision = await decider(ctx, s, c);
  } catch (e) {
    // Une panne ne laisse jamais une opération à moitié faite : on oublie tout et on le dit
    oublier(s);
    erreurs.push(e instanceof Error ? e.message : String(e));
    decision = { morceaux: [r('RF064')], statut: 'erreur', validation: 'erreur technique : rien exécuté' };
  }
  const rendus = decision.morceaux.map((m) => ctx.reponses.rendre(m, s.langue, s.canal));
  if (c.intention !== 'repeter' || !s.derniere.length) s.derniere = decision.morceaux.filter((m) => !('ref' in m && (m.ref === 'RF111' || m.ref === 'RF100')));
  const empreinte = decision.operation ? await empreinteOperation(decision.operation) : null;
  const journal = ligneJournal({ session: s, comprehension: c, decision, rendus, empreinte, erreurs, duree: performance.now() - debut });
  return { texte: rendus.map((x) => x.texte).join('\n'), rendus, journal };
}
