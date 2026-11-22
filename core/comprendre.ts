// Comprendre une demande financière : l'intention (solde, transfert…), les valeurs (montants, numéros, contacts,
// facture) et ce qui change le sens (négation, valeur écartée par une correction). Pur : un texte et des données
// en entrée, un résultat en sortie. Le vocabulaire n'est pas dans le code : il vient des lexiques passés par
// l'appelant (service/lexique-fr.json, termes validés du pack). Chaque intention retenue dit pourquoi.
// Dans le doute, aucune intention n'est retenue : c'est à l'appelant de poser une question.

import { sansAccents } from './langage.ts';
import { MOTS_FRANCAIS, nombresEnLettres, type MotsNombres } from './nombres.ts';

export interface Lexique {
  // Mot ou expression -> poids, par intention
  intentions: Record<string, Record<string, number>>;
  // Intentions qui ne l'emportent que si aucune autre n'est reconnue (saluer, remercier, oui…)
  secondaires: string[];
  periodes: Record<string, string>;
  factures: Record<string, string>;
  langues: Record<string, string>;
  devises: string[];
  multiplicateurs: Record<string, number>;
  nombres?: MotsNombres;
}

export interface Contact { id: string; nom: string; alias: string[]; telephone: string; type: string }
export interface Terme { ref: string; terme: string }

export interface Valeur { valeur: number; debut: number; fin: number; rejete: boolean; monnaie: boolean }
export interface Mention { contacts: Contact[]; debut: number; fin: number; rejete: boolean }

export interface Comprehension {
  texte: string;
  normal: string;
  intention: string | null;
  score: number;
  // Deux intentions presque à égalité : il faut demander laquelle
  hesitation: string[];
  raison: string;
  montants: Valeur[];
  nombres: Valeur[];
  telephones: { numero: string; debut: number; fin: number; rejete: boolean }[];
  contacts: Mention[];
  facture: string | null;
  typeFacture: string | null;
  terme: Terme | null;
  periode: string | null;
  langue: string | null;
  negation: boolean;
  // Le texte n'est qu'une touche ou un choix de menu : « 1 », « 2 »
  touche: string | null;
}

export const SEUIL = 2;
// Au-dessous de ce montant, un nombre sans devise est un compte (« mes 3 dernières opérations »)
const PLUS_PETIT_MONTANT = 100;

// Minuscules, sans accents ni apostrophes, séparateurs de milliers ramenés à l'espace
export function normaliser(texte: string): string {
  return sansAccents(texte.toLowerCase())
    .replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1 ')
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9+\s-]/g, ' ')
    .replace(/(?<![a-z])-|-(?![a-z])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motif = (expression: string) => new RegExp(`(?<![a-z0-9])${echapper(normaliser(expression))}(?![a-z0-9])`, 'g');
const masquer = (texte: string, debut: number, fin: number) => texte.slice(0, debut) + '#'.repeat(fin - debut) + texte.slice(fin);

// Valeur écartée par celui qui parle : « pas 5 000 », « non pas à Paul », « au lieu de 5 000 »
const ECARTEE = /(?:\bpas|\bnon|\bau lieu de|\bplutot que)(?:\s(?:a|au|de|d|pour))?\s*$/;
const ecartee = (normal: string, debut: number) => ECARTEE.test(normal.slice(Math.max(0, debut - 30), debut));

// Numéro mobile camerounais : 9 chiffres commençant par 6, indicatif 237 facultatif. Suivi d'une devise,
// c'est une somme (« 650 000 000 F »), pas un numéro.
const TELEPHONE = /(?<![\d#])(?:(?:\+|00)?\s?237[\s-]?)?6(?:[\s-]?\d){8}(?![\d#])/g;
const FACTURE = /\bfacture\s+(?:(?:numero|num|no|n)\s+)?(\d(?:[\d\s]*\d)?)/;

function suffixe(normal: string, fin: number, mots: string[]) {
  if (!mots.length) return null;
  const m = normal.slice(fin).match(new RegExp(`^\\s?(${mots.map(echapper).join('|')})(?![a-z0-9])`));
  return m ? { mot: m[1], fin: fin + m[0].length } : null;
}

function telephones(normal: string, lexique: Lexique) {
  const trouves: Comprehension['telephones'] = [];
  for (const m of normal.matchAll(TELEPHONE)) {
    const fin = m.index! + m[0].length;
    if (suffixe(normal, fin, lexique.devises)) continue;
    trouves.push({ numero: m[0].replace(/\D/g, '').slice(-9), debut: m.index!, fin, rejete: ecartee(normal, m.index!) });
  }
  return trouves;
}

// Montants et petits nombres, en chiffres (« 10 000 », « 5 mille ») ou en lettres (« deux mille cinq cents »)
function completer(normal: string, lexique: Lexique, { valeur, debut, fin }: { valeur: number; debut: number; fin: number }): Valeur {
  const multiple = suffixe(normal, fin, Object.keys(lexique.multiplicateurs));
  if (multiple) { valeur *= lexique.multiplicateurs[multiple.mot]; fin = multiple.fin; }
  const devise = suffixe(normal, fin, lexique.devises);
  if (devise) fin = devise.fin;
  return { valeur, debut, fin, rejete: ecartee(normal, debut), monnaie: Boolean(devise || multiple) || valeur >= PLUS_PETIT_MONTANT };
}

function valeurs(normal: string, masque: string, lexique: Lexique): Valeur[] {
  const chiffres = [...masque.matchAll(/(?<![\d#])\d{1,3}(?:\s\d{3})+(?![\d#])|(?<![\d#])\d+(?![\d#])/g)]
    .map((m) => completer(normal, lexique, { valeur: Number(m[0].replace(/\s/g, '')), debut: m.index!, fin: m.index! + m[0].length }));
  // « 5 mille » est déjà compté : son « mille » ne doit pas devenir un second nombre
  for (const v of chiffres) masque = masquer(masque, v.debut, v.fin);
  const lettres = nombresEnLettres(masque, lexique.nombres || MOTS_FRANCAIS).map((n) => completer(normal, lexique, n));
  return [...chiffres, ...lettres].sort((a, b) => a.debut - b.debut);
}

// Contacts du carnet nommés dans la demande. Un prénom porté par deux contacts reste ambigu : on garde les deux.
function contacts(normal: string, carnet: Contact[]): Mention[] {
  const vues: Mention[] = [];
  for (const contact of carnet) {
    for (const nom of [contact.nom, ...contact.alias]) {
      for (const m of normal.matchAll(motif(nom))) {
        const fin = m.index! + m[0].length;
        const meme = vues.find((v) => v.debut === m.index && v.fin === fin);
        if (meme) { if (!meme.contacts.includes(contact)) meme.contacts.push(contact); }
        else vues.push({ contacts: [contact], debut: m.index!, fin, rejete: ecartee(normal, m.index!) });
      }
    }
  }
  // « Paul Mbarga » l'emporte sur le « Paul » qu'il contient
  return vues.filter((v) => !vues.some((w) => w !== v && w.debut <= v.debut && w.fin >= v.fin && w.fin - w.debut > v.fin - v.debut))
    .sort((a, b) => a.debut - b.debut);
}

function premier(normal: string, table: Record<string, string>): string | null {
  const trouves = Object.entries(table)
    .map(([mot, sens]) => ({ sens, m: motif(mot).exec(normal), longueur: mot.length }))
    .filter((t) => t.m)
    .sort((a, b) => b.longueur - a.longueur);
  return trouves.length ? trouves[0].sens : null;
}

function terme(normal: string, termes: Terme[]): Terme | null {
  const trouves = termes.flatMap((t) => t.terme.split('/').map((forme) => ({ t, forme: forme.trim() })))
    .filter(({ forme }) => forme && motif(forme).test(normal))
    .sort((a, b) => b.forme.length - a.forme.length);
  return trouves.length ? trouves[0].t : null;
}

// Négation d'une action : « n'envoie pas », « ne paie jamais », « surtout pas ». « Je n'ai pas compris »
// est une demande de répétition, pas un refus.
function negation(normal: string): boolean {
  if (/\bn\s?ai pas (compris|entendu|bien compris)\b/.test(normal)) return false;
  return /\b(ne|n)\s(?:[a-z]+\s){0,2}?(pas|jamais|rien|plus)\b/.test(normal) || /\b(ne pas|surtout pas)\b/.test(normal);
}

interface Note { intention: string; score: number; mots: string[] }

function noter(normal: string, lexiques: Lexique[], bonus: Record<string, number>): Note[] {
  const notes = new Map<string, Note>();
  for (const lexique of lexiques) {
    for (const [intention, mots] of Object.entries(lexique.intentions)) {
      const note = notes.get(intention) || { intention, score: 0, mots: [] };
      for (const [mot, poids] of Object.entries(mots)) {
        if (motif(mot).test(normal) && !note.mots.includes(mot)) { note.score += poids; note.mots.push(mot); }
      }
      notes.set(intention, note);
    }
  }
  for (const [intention, points] of Object.entries(bonus)) {
    const note = notes.get(intention);
    if (note && note.score > 0) note.score += points;
  }
  return [...notes.values()].filter((n) => n.score > 0).sort((a, b) => b.score - a.score);
}

function choisir(notes: Note[], secondaires: Set<string>) {
  const fortes = notes.filter((n) => n.score >= SEUIL);
  const principales = fortes.filter((n) => !secondaires.has(n.intention));
  const rang = principales.length ? principales : fortes;
  if (!rang.length) return { note: null, hesitation: [] };
  const egales = rang.filter((n) => rang[0].score - n.score < 1);
  return { note: rang[0], hesitation: egales.length > 1 ? egales.map((n) => n.intention) : [] };
}

export interface Donnees { lexiques: Lexique[]; carnet?: Contact[]; termes?: Terme[] }

export function comprendre(texte: string, { lexiques, carnet = [], termes = [] }: Donnees): Comprehension {
  const normal = normaliser(texte);
  const lexique = lexiques[0];
  const devises = [...new Set(lexiques.flatMap((l) => l.devises))];
  const multiplicateurs = Object.assign({}, ...lexiques.map((l) => l.multiplicateurs));
  const reunis = { ...lexique, devises, multiplicateurs };
  const tel = telephones(normal, reunis);
  const facture = normal.match(FACTURE);
  let masque = normal;
  for (const t of tel) masque = masquer(masque, t.debut, t.fin);
  if (facture) masque = masquer(masque, facture.index! + facture[0].length - facture[1].length, facture.index! + facture[0].length);
  const toutes = valeurs(normal, masque, reunis);
  const trouve = terme(normal, termes);
  const secondaires = new Set(lexiques.flatMap((l) => l.secondaires));
  const notes = noter(normal, lexiques, trouve ? { expliquer: 2 } : {});
  const { note, hesitation } = choisir(notes, secondaires);
  const montants = toutes.filter((v) => v.monnaie);
  const mentions = contacts(normal, carnet);
  // « 10 000 à Pierre » : une somme et un bénéficiaire, sans verbe, ne peuvent vouloir dire qu'un envoi.
  // Rien ne part pour autant : l'envoi attend toujours la confirmation de l'utilisateur.
  const envoiSansVerbe = !note && !hesitation.length && montants.some((v) => !v.rejete)
    && (mentions.some((m) => !m.rejete) || tel.some((t) => !t.rejete));
  return {
    texte, normal,
    intention: envoiSansVerbe ? 'transfert' : hesitation.length ? null : note ? note.intention : null,
    score: note ? note.score : envoiSansVerbe ? SEUIL : 0,
    hesitation,
    raison: note ? `mots reconnus : ${note.mots.join(', ')}` : envoiSansVerbe ? 'une somme et un bénéficiaire, sans autre demande' : 'aucun mot connu',
    montants,
    nombres: toutes.filter((v) => !v.monnaie),
    telephones: tel,
    contacts: mentions,
    facture: facture ? facture[1].replace(/\s/g, '') : null,
    typeFacture: lexiques.map((l) => premier(normal, l.factures)).find(Boolean) || null,
    terme: trouve,
    periode: lexiques.map((l) => premier(normal, l.periodes)).find(Boolean) || null,
    langue: lexiques.map((l) => premier(normal, l.langues)).find(Boolean) || null,
    negation: negation(normal),
    touche: /^\d{1,2}$/.test(normal) ? normal : null,
  };
}
