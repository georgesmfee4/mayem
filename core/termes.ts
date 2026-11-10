// Termes du glossaire utilisables hors des phrases du corpus, sans jamais composer de phrase :
// - un libellé court (« Solde », « Annuler », « Frais : 500 FCFA ») qui EST un terme est traduit par ce terme ;
// - dans une phrase inconnue, les termes critiques reconnus sont seulement signalés (glose), la phrase reste en français.
// Un terme ne sert que s'il a été traduit et relu par deux personnes différentes, et si sa traduction
// est un mot ou une expression, pas une explication.

import type { Pack, Terme } from './types.ts';

export interface Glose { ref: string; fr: string; traduction: string; critique: boolean }

// glose : concept critique (argent, sécurité), défini dans « sens » ; un mot grammatical (« aucun »,
// « après ») a pour sens un exemple entre guillemets et n'est pas glosé : hors contexte, il n'aide pas
interface Entree extends Glose { mots: string[]; glose: boolean }
interface IndexTermes { exacts: Map<string, Entree>; parMot: Map<string, Entree[]> }

const formesDe = (champ: string) => champ.split('/').map((forme) => forme.trim()).filter(Boolean);
const memeAuteur = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// Comparaison : casse, apostrophes et espaces ignorés ; les accents comptent (« côte » n'est pas « cote »)
const cle = (s: string) => s.normalize('NFC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const motsDe = (s: string) => cle(s).split(/[^\p{L}\p{N}']+/u).filter(Boolean);

export const termeUtilisable = (t: Terme) =>
  t.bulu.trim() !== '' && t.traduit_par.trim() !== '' && t.relu_par.trim() !== '' && !memeAuteur(t.traduit_par, t.relu_par)
  && !/[(:;…]|\.\.\.|\bpour\b|\.$/.test(t.bulu) && !/[(:…]/.test(t.terme);

function indexerTermes(pack: Pack): IndexTermes {
  const index: IndexTermes = { exacts: new Map(), parMot: new Map() };
  for (const t of pack.glossaire.filter(termeUtilisable)) {
    const francais = formesDe(t.terme);
    const traductions = formesDe(t.bulu);
    francais.forEach((fr, i) => {
      // « frais / commission » = « Kufa / Kufo » : formes appariées ; sinon la première traduction
      const traduction = traductions.length === francais.length ? traductions[i] : traductions[0];
      const glose = t.critique && !/^\s*[«"]/.test(t.sens);
      const entree = { mots: motsDe(fr), fr, traduction, ref: t.ref, critique: t.critique, glose };
      if (fr.length < 3 || !entree.mots.length) return;
      if (!index.exacts.has(cle(fr))) index.exacts.set(cle(fr), entree);
      const premier = entree.mots[0];
      index.parMot.set(premier, [...(index.parMot.get(premier) || []), entree]);
    });
  }
  // Les termes les plus longs d'abord : « code secret » avant « code »
  for (const liste of index.parMot.values()) liste.sort((a, b) => b.mots.length - a.mots.length);
  return index;
}

const cacheTermes = new WeakMap<Pack, IndexTermes>();
function indexTermesDe(pack: Pack): IndexTermes {
  let index = cacheTermes.get(pack);
  if (!index) cacheTermes.set(pack, (index = indexerTermes(pack)));
  return index;
}

// Majuscule initiale reprise du texte d'origine : « Solde » -> « Mebal », « solde » -> « mebal »
function commeLOrigine(origine: string, traduction: string): string {
  const initiale = origine.match(/\p{L}/u)?.[0] || '';
  if (initiale && initiale === initiale.toUpperCase()) return traduction.charAt(0).toUpperCase() + traduction.slice(1);
  return traduction.charAt(0).toLowerCase() + traduction.slice(1);
}

// Le texte entier est un terme : sa traduction, sinon null
export function traduireTerme(texte: string, pack: Pack): Glose | null {
  const entree = indexTermesDe(pack).exacts.get(cle(texte));
  return entree ? { ref: entree.ref, fr: texte, traduction: commeLOrigine(texte, entree.traduction), critique: entree.critique } : null;
}

// Concepts critiques reconnus dans un texte, dans l'ordre, sans chevauchement ni doublon
export function termesConnus(texte: string, pack: Pack): Glose[] {
  const { parMot } = indexTermesDe(pack);
  const suite = motsDe(texte);
  const trouves: Glose[] = [];
  for (let i = 0; i < suite.length; i++) {
    const entree = (parMot.get(suite[i]) || []).find((e) => e.mots.every((mot, k) => suite[i + k] === mot));
    if (!entree?.glose) continue;
    if (!trouves.some((g) => g.ref === entree.ref)) trouves.push({ ref: entree.ref, fr: entree.fr, traduction: entree.traduction, critique: entree.critique });
    i += entree.mots.length - 1;
  }
  return trouves;
}
