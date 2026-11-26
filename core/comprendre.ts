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
  // Mots qui écartent la valeur qui suit (« pas 5 000 », « sa'ake Paul ») et petits mots qui peuvent s'intercaler
  ecartent?: string[];
  liaisons?: string[];
  // Expressions de négation d'une action propres à la langue (« te lôm ») ; le français a sa grammaire plus bas
  negations?: string[];
  // Formulations recueillies auprès des locuteurs : une demande proche de l'une d'elles en prend l'intention
  formulations?: { ref: string; intention: string; texte: string }[];
  // Textes validés de la langue (traductions, termes) : ils disent quels mots sont courants, donc peu parlants
  textes?: string[];
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

// Valeur écartée par celui qui parle : « pas 5 000 », « non pas à Paul », « au lieu de 5 000 », « sa'ake Paul »
type Ecarte = (debut: number) => boolean;
function ecarteur(normal: string, lexiques: Lexique[]): Ecarte {
  const ecartent = lexiques.flatMap((l) => l.ecartent || []).map((m) => echapper(normaliser(m)));
  const liaisons = lexiques.flatMap((l) => l.liaisons || []).map((m) => echapper(normaliser(m)));
  if (!ecartent.length) return () => false;
  const motif = new RegExp(`(?<![a-z0-9])(?:${ecartent.join('|')})(?:\\s(?:${liaisons.join('|') || '(?!)'}))?\\s*$`);
  return (debut) => motif.test(normal.slice(Math.max(0, debut - 30), debut));
}

// Numéro mobile camerounais : 9 chiffres commençant par 6, indicatif 237 facultatif. Suivi d'une devise,
// c'est une somme (« 650 000 000 F »), pas un numéro.
const TELEPHONE = /(?<![\d#])(?:(?:\+|00)?\s?237[\s-]?)?6(?:[\s-]?\d){8}(?![\d#])/g;
const FACTURE = /\bfacture\s+(?:(?:numero|num|no|n)\s+)?(\d(?:[\d\s]*\d)?)/;

function suffixe(normal: string, fin: number, mots: string[]) {
  if (!mots.length) return null;
  const m = normal.slice(fin).match(new RegExp(`^\\s?(${mots.map(echapper).join('|')})(?![a-z0-9])`));
  return m ? { mot: m[1], fin: fin + m[0].length } : null;
}

function telephones(normal: string, lexique: Lexique, ecartee: Ecarte) {
  const trouves: Comprehension['telephones'] = [];
  for (const m of normal.matchAll(TELEPHONE)) {
    const fin = m.index! + m[0].length;
    if (suffixe(normal, fin, lexique.devises)) continue;
    trouves.push({ numero: m[0].replace(/\D/g, '').slice(-9), debut: m.index!, fin, rejete: ecartee(m.index!) });
  }
  return trouves;
}

// Montants et petits nombres, en chiffres (« 10 000 », « 5 mille ») ou en lettres (« deux mille cinq cents »)
function completer(normal: string, lexique: Lexique, ecartee: Ecarte, { valeur, debut, fin }: { valeur: number; debut: number; fin: number }): Valeur {
  const multiple = suffixe(normal, fin, Object.keys(lexique.multiplicateurs));
  if (multiple) { valeur *= lexique.multiplicateurs[multiple.mot]; fin = multiple.fin; }
  const devise = suffixe(normal, fin, lexique.devises);
  if (devise) fin = devise.fin;
  return { valeur, debut, fin, rejete: ecartee(debut), monnaie: Boolean(devise || multiple) || valeur >= PLUS_PETIT_MONTANT };
}

function valeurs(normal: string, masque: string, lexique: Lexique, ecartee: Ecarte): Valeur[] {
  const chiffres = [...masque.matchAll(/(?<![\d#])\d{1,3}(?:\s\d{3})+(?![\d#])|(?<![\d#])\d+(?![\d#])/g)]
    .map((m) => completer(normal, lexique, ecartee, { valeur: Number(m[0].replace(/\s/g, '')), debut: m.index!, fin: m.index! + m[0].length }));
  // « 5 mille » est déjà compté : son « mille » ne doit pas devenir un second nombre
  for (const v of chiffres) masque = masquer(masque, v.debut, v.fin);
  const lettres = nombresEnLettres(masque, lexique.nombres || MOTS_FRANCAIS).map((n) => completer(normal, lexique, ecartee, n));
  return [...chiffres, ...lettres].sort((a, b) => a.debut - b.debut);
}

// Contacts du carnet nommés dans la demande. Un prénom porté par deux contacts reste ambigu : on garde les deux.
function contacts(normal: string, carnet: Contact[], ecartee: Ecarte): Mention[] {
  const vues: Mention[] = [];
  for (const contact of carnet) {
    for (const nom of [contact.nom, ...contact.alias]) {
      for (const m of normal.matchAll(motif(nom))) {
        const fin = m.index! + m[0].length;
        const meme = vues.find((v) => v.debut === m.index && v.fin === fin);
        if (meme) { if (!meme.contacts.includes(contact)) meme.contacts.push(contact); }
        else vues.push({ contacts: [contact], debut: m.index!, fin, rejete: ecartee(m.index!) });
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
function negation(normal: string, lexiques: Lexique[]): boolean {
  if (/\bn\s?ai pas (compris|entendu|bien compris)\b/.test(normal)) return false;
  if (lexiques.some((l) => (l.negations || []).some((n) => motif(n).test(normal)))) return true;
  return /\b(ne|n)\s(?:[a-z]+\s){0,2}?(pas|jamais|rien|plus)\b/.test(normal) || /\b(ne pas|surtout pas)\b/.test(normal);
}

interface Note { intention: string; score: number; mots: string[] }

// Formulations des locuteurs : chaque mot pèse d'autant plus qu'il est rare dans la langue (« lôm » dit peu,
// « mvolan » dit beaucoup). La rareté se compte sur les formulations et sur tous les textes validés de la langue :
// les petits mots courants (« ma », « a », « te ») ne décident plus seuls. Les chiffres et les noms du carnet ne
// comptent pas : seule la façon de demander compte.
const SEUIL_PROCHE = 0.5;
const motsDe = (texte: string, ignores: Set<string>) =>
  new Set(normaliser(texte).split(' ').filter((m) => /[a-z]/.test(m) && m.length > 1 && !ignores.has(m)));

const poidsParLexique = new WeakMap<Lexique, Map<string, number>>();
function poidsDes(lexique: Lexique): Map<string, number> {
  let poids = poidsParLexique.get(lexique);
  if (!poids) {
    const documents = [...(lexique.formulations || []).map((f) => f.texte), ...(lexique.textes || [])];
    const compte = new Map<string, number>();
    for (const texte of documents) for (const m of motsDe(texte, new Set())) compte.set(m, (compte.get(m) || 0) + 1);
    poids = new Map([...compte].map(([m, n]) => [m, Math.log(1 + documents.length / n)]));
    poidsParLexique.set(lexique, poids);
  }
  return poids;
}

// Un terme à expliquer joue le même rôle d'une demande à l'autre (« plafond, c'est quoi ? », « bénéficiaire, c'est
// quoi ? ») : pour comparer une demande aux formulations d'explication, chaque terme devient une même case
const CASE_TERME = '0terme';
const motifsParTermes = new WeakMap<Terme[], RegExp[]>();
function avecCaseTerme(normal: string, termes: Terme[]): string {
  let motifs = motifsParTermes.get(termes);
  if (!motifs) {
    const formes = termes.flatMap((t) => t.terme.split('/').map((f) => normaliser(f))).filter((f) => f.length > 2);
    motifs = [...new Set(formes)].sort((a, b) => b.length - a.length).map((f) => motif(f));
    motifsParTermes.set(termes, motifs);
  }
  return motifs.reduce((texte, m) => texte.replace(m, CASE_TERME), normal);
}

// Écart minimal entre la meilleure intention et la suivante : en dessous, deux intentions sont plausibles et
// c'est à la personne de dire laquelle
const ECART_PROCHE = 0.1;

// La formulation validée la plus proche de la demande, si elle l'est assez et sans rivale d'une autre intention
export function plusProche(normal: string, lexiques: Lexique[], ignores: Set<string>, termes: Terme[] = []) {
  const parIntention = new Map<string, { ref: string; intention: string; texte: string; proximite: number }>();
  // Seulement si la demande nomme elle-même un terme : sans terme, une formulation d'explication privée du sien ne
  // garde que de petits mots, qui ressembleraient à n'importe quoi
  const remplacee = termes.length ? avecCaseTerme(normal, termes) : normal;
  const avecCase = remplacee.includes(CASE_TERME) ? motsDe(remplacee, ignores) : null;
  for (const lexique of lexiques) {
    const poids = poidsDes(lexique);
    const masse = (mots: Set<string>) => [...mots].reduce((t, m) => t + (poids.get(m) ?? Math.log(2)), 0);
    for (const f of lexique.formulations || []) {
      const explication = f.intention === 'expliquer' && avecCase;
      const demande = explication ? avecCase : motsDe(normal, ignores);
      const mots = explication ? motsDe(avecCaseTerme(normaliser(f.texte), termes), ignores) : motsDe(f.texte, ignores);
      const communs = new Set([...mots].filter((m) => demande.has(m)));
      if (!communs.size) continue;
      const proximite = (2 * masse(communs)) / (masse(mots) + masse(demande));
      if (proximite > (parIntention.get(f.intention)?.proximite ?? 0)) parIntention.set(f.intention, { ...f, proximite });
    }
  }
  const [premiere, seconde] = [...parIntention.values()].sort((a, b) => b.proximite - a.proximite);
  if (!premiere || premiere.proximite < SEUIL_PROCHE) return null;
  return seconde && premiere.proximite - seconde.proximite < ECART_PROCHE ? null : premiere;
}

// Une lettre de plus, de moins ou changée (« facktur » pour « faktur ») : seulement entre mots longs, où une
// lettre ne change pas le sens ; entre mots courts, une lettre en fait un autre mot
const LONGUEUR_TOLEREE = 6;
function uneLettre(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return a === b;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  const [reste1, reste2] = [a.slice(i), b.slice(i)];
  return reste1.slice(1) === reste2.slice(1) || reste1.slice(1) === reste2 || reste1 === reste2.slice(1);
}
// Seul un mot de la demande que le moteur ne connaît pas peut être un mot connu mal écrit : un mot déjà reconnu
// (« envoyer ») ne compte jamais une seconde fois pour un voisin (« envoyez »)
function malEcrits(normal: string, lexiques: Lexique[]): Set<string> {
  const connus = new Set(lexiques.flatMap((l) => Object.values(l.intentions).flatMap(Object.keys)).map((m) => normaliser(m)));
  return new Set(normal.split(' ').filter((m) => m.length >= LONGUEUR_TOLEREE && !connus.has(m)));
}

function noter(normal: string, lexiques: Lexique[], bonus: Record<string, number>, ignores: Set<string>, termes: Terme[] = []): Note[] {
  const notes = new Map<string, Note>();
  const proche = plusProche(normal, lexiques, ignores, termes);
  const inconnus = malEcrits(normal, lexiques);
  if (proche) notes.set(proche.intention, { intention: proche.intention, score: Math.round(proche.proximite * 6), mots: [`proche de ${proche.ref} « ${proche.texte} »`] });
  for (const lexique of lexiques) {
    for (const [intention, mots] of Object.entries(lexique.intentions)) {
      const note = notes.get(intention) || { intention, score: 0, mots: [] };
      for (const [mot, poids] of Object.entries(mots)) {
        if (note.mots.some((m) => m === mot || m.startsWith(`${mot} `))) continue;
        const cherche = normaliser(mot);
        const voisin = cherche.length >= LONGUEUR_TOLEREE && !cherche.includes(' ') ? [...inconnus].find((m) => uneLettre(m, cherche)) : undefined;
        if (motif(mot).test(normal)) { note.score += poids; note.mots.push(mot); } else if (voisin && !note.mots.some((m) => m.endsWith(`(${voisin})`))) {
          note.score += poids;
          note.mots.push(`${mot} (${voisin})`);
        }
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
  const ecartee = ecarteur(normal, lexiques);
  const tel = telephones(normal, reunis, ecartee);
  const facture = normal.match(FACTURE);
  let masque = normal;
  for (const t of tel) masque = masquer(masque, t.debut, t.fin);
  if (facture) masque = masquer(masque, facture.index! + facture[0].length - facture[1].length, facture.index! + facture[0].length);
  const toutes = valeurs(normal, masque, reunis, ecartee);
  const trouve = terme(normal, termes);
  const secondaires = new Set(lexiques.flatMap((l) => l.secondaires));
  const ignores = new Set(carnet.flatMap((c) => [c.nom, ...c.alias]).flatMap((n) => normaliser(n).split(' ')));
  const notes = noter(normal, lexiques, trouve ? { expliquer: 2 } : {}, ignores, termes);
  const { note, hesitation } = choisir(notes, secondaires);
  const montants = toutes.filter((v) => v.monnaie);
  const mentions = contacts(normal, carnet, ecartee);
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
    negation: negation(normal, lexiques),
    touche: /^\d{1,2}$/.test(normal) ? normal : null,
  };
}
