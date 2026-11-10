// Couche page : traduit la page telle qu'elle est, sans toucher au code du service.
// On ne modifie que la valeur des nœuds texte déjà présents (jamais de HTML injecté,
// jamais de nœud ajouté dans la page) et on ne lit ni ne modifie aucun champ de saisie.

import { estPhrase, memesChiffres } from '../core/faits.ts';
import { etiquette, normaliser, traduire } from '../core/moteur.ts';
import { repartir } from '../core/repartir.ts';
import type { Options, Pack, Resultat } from '../core/types.ts';
import { ID_HOTE, creerInterface, type Interface } from './interface.ts';

const IGNORES = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT_VALUE', 'CODE', 'PRE', 'svg', 'SVG']);
const ATTRIBUTS = ['placeholder', 'title', 'aria-label'];
const MARQUES = ['data-mayem', 'data-mayem-critique', 'data-mayem-cat'];
// Balises de mise en forme : le texte qu'elles coupent est lu comme un seul bloc
const EN_LIGNE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'DATA', 'EM', 'FONT', 'I', 'LABEL', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U']);

let pack: Pack;
let options: Options;
let ui: Interface;
let afficheBulu = true;
// nœud texte -> texte d'origine et texte traduit, pour pouvoir revenir en arrière
const ecrits = new Map<Text, { origine: string; traduit: string }>();

const dansNotreUi = (el: Element) => el.closest(`#${ID_HOTE}`);
const modifiable = (el: Element) => el.closest('[contenteditable]:not([contenteditable="false"])');

function marquer(el: Element, res: Resultat) {
  for (const nom of MARQUES) el.removeAttribute(nom);
  el.setAttribute('data-mayem', res.statut);
  if (res.critique) el.setAttribute('data-mayem-critique', '1');
  if (res.statut === 'ok') el.setAttribute('lang', pack.langue);
  // Contenu inédit : étiquette validée affichée en CSS (::before), donc hors du texte
  // de la page : aucune valeur ni aucun texte d'origine n'est touché.
  if (res.categorie) {
    const texte = etiquette(res.categorie, pack, options);
    if (texte) el.setAttribute('data-mayem-cat', texte);
  }
}

function ecrire(noeud: Text, sortie: string, brut = noeud.nodeValue || '') {
  // On garde les espaces autour du texte : la mise en page en dépend parfois
  const traduit = brut.match(/^\s*/)![0] + sortie + brut.match(/\s*$/)![0];
  ecrits.set(noeud, { origine: brut, traduit });
  if (afficheBulu && noeud.nodeValue !== traduit) noeud.nodeValue = traduit;
}

// Nœuds texte d'un élément, ou null s'il contient autre chose que des balises de mise en forme
function textesDe(el: Element): Text[] | null {
  const textes: Text[] = [];
  const marcheur = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) textes.push(n as Text);
    else if (!EN_LIGNE.has((n as Element).tagName)) return null;
  }
  return textes;
}

// Plus grand élément autour du nœud qui ne contient que du texte et des balises de mise en forme,
// s'il réunit au moins deux morceaux de texte
function blocDe(noeud: Text): Element | null {
  let bloc: Element | null = null;
  for (let el = noeud.parentElement; el && el !== document.body; el = el.parentElement) {
    if (!textesDe(el)) break;
    bloc = el;
    if (!EN_LIGNE.has(el.tagName)) break;
  }
  const morceaux = bloc ? textesDe(bloc)!.filter((t) => (t.nodeValue || '').trim()) : [];
  return morceaux.length >= 2 ? bloc : null;
}

// Texte du service, même si nous l'avons déjà remplacé par le bulu
function origineDe(noeud: Text): string {
  const deja = ecrits.get(noeud);
  return deja && noeud.nodeValue === deja.traduit ? deja.origine : noeud.nodeValue || '';
}

// Le bloc entier est traduit, puis le bulu est rangé dans ses nœuds texte ; faux si impossible
function traiterBloc(bloc: Element): boolean {
  const noeuds = textesDe(bloc)!;
  const origines = noeuds.map(origineDe);
  const res = traduire(origines.join(''), pack, options);
  const textes = res?.sortie ? repartir(origines, res.sortie, res.valeurs) : null;
  if (!res || !textes) return false;
  noeuds.forEach((noeud, i) => {
    if (textes[i] !== normaliser(origines[i])) return ecrire(noeud, textes[i], origines[i]);
    ecrits.delete(noeud); // morceau protégé (montant, nom) : jamais réécrit
    if (noeud.nodeValue !== origines[i]) noeud.nodeValue = origines[i];
  });
  marquer(bloc, res);
  prevoirCompteurs();
  return true;
}

function traiterTexte(noeud: Text) {
  const parent = noeud.parentElement;
  if (!parent || IGNORES.has(parent.tagName) || dansNotreUi(parent) || modifiable(parent)) return;
  const brut = noeud.nodeValue || '';
  const deja = ecrits.get(noeud);
  if (deja && (brut === deja.traduit || brut === deja.origine)) return; // notre propre écriture
  ecrits.delete(noeud); // le service a changé le texte : on repart de zéro
  const bloc = blocDe(noeud);
  if (bloc && !modifiable(bloc) && traiterBloc(bloc)) return;
  const res = traduire(brut, pack, options);
  if (!res) return;
  if (res.sortie) {
    ecrire(noeud, res.sortie);
    marquer(parent, res);
  } else if (estPhrase(brut) || res.critique) {
    marquer(parent, res); // original conservé, signalé
  }
  prevoirCompteurs();
}

function traiterAttributs(el: Element) {
  if (dansNotreUi(el)) return;
  for (const nom of ATTRIBUTS) {
    const valeur = el.getAttribute(nom);
    if (!valeur || valeur === el.getAttribute(`data-mayem-traduit-${nom}`)) continue;
    const res = traduire(valeur, pack, options);
    if (!res?.sortie) continue;
    el.setAttribute(`data-mayem-origine-${nom}`, valeur);
    el.setAttribute(`data-mayem-traduit-${nom}`, res.sortie);
    if (afficheBulu) el.setAttribute(nom, res.sortie);
  }
}

function parcourir(racine: Node) {
  if (racine.nodeType === Node.TEXT_NODE) return traiterTexte(racine as Text);
  if (racine.nodeType !== Node.ELEMENT_NODE || dansNotreUi(racine as Element)) return;
  traiterAttributs(racine as Element);
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) traiterTexte(n as Text);
    else traiterAttributs(n as Element);
  }
}

function basculer(bulu: boolean) {
  afficheBulu = bulu;
  for (const [noeud, e] of ecrits) {
    if (!noeud.isConnected) ecrits.delete(noeud);
    else noeud.nodeValue = bulu ? e.traduit : e.origine;
  }
  const selecteur = ATTRIBUTS.map((nom) => `[data-mayem-origine-${nom}]`).join(',');
  document.querySelectorAll(selecteur).forEach((el) => {
    for (const nom of ATTRIBUTS) {
      const valeur = el.getAttribute(`data-mayem-${bulu ? 'traduit' : 'origine'}-${nom}`);
      if (valeur !== null) el.setAttribute(nom, valeur);
    }
  });
}

// Compteurs recalculés à partir de la page, avec un vrai contrôle des chiffres de chaque texte traduit
let compteursPrevus = false;
function prevoirCompteurs() {
  if (compteursPrevus) return;
  compteursPrevus = true;
  requestAnimationFrame(() => {
    compteursPrevus = false;
    let traduits = 0, verifies = 0, ecarts = 0;
    for (const [noeud, e] of ecrits) {
      if (!noeud.isConnected) { ecrits.delete(noeud); continue; }
      traduits++;
      if (/\d/.test(e.origine)) memesChiffres(e.origine, e.traduit) ? verifies++ : ecarts++;
    }
    const conserves = document.querySelectorAll('[data-mayem="non_verifie"],[data-mayem="rejete"]').length;
    const chiffres = ecarts ? `${ecarts} écart(s) !` : `${verifies} ✓`;
    ui?.afficherCompteurs({ traduits, conserves, chiffres });
  });
}

// Nouveau clic sur l'icône une fois Mayem lancé : original <-> bulu
export function inverser() {
  ui.inverser();
}

export function demarrer(lePack: Pack, lesOptions: Options) {
  pack = lePack;
  options = lesOptions;
  ui = creerInterface(!!options.test, basculer);
  parcourir(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') traiterTexte(m.target as Text);
      else if (m.type === 'attributes') traiterAttributs(m.target as Element);
      else m.addedNodes.forEach(parcourir);
    }
  }).observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRIBUTS,
  });
  prevoirCompteurs();
}
