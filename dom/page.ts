// Couche page : traduit la page telle qu'elle est, sans toucher au code du service.
// On ne modifie que la valeur des nœuds texte déjà présents (jamais de HTML injecté,
// jamais de nœud ajouté dans la page) et on ne lit ni ne modifie aucun champ de saisie.

import { memesChiffres } from '../core/faits.ts';
import { etiquette, normaliser, traduire } from '../core/moteur.ts';
import { repartir } from '../core/repartir.ts';
import type { Options, Pack, Resultat } from '../core/types.ts';
import { ID_HOTE, creerInterface, type Interface, type Langue } from './interface.ts';

// Pack vérifié d'une autre langue : demandé au script de fond (extension) ou pris parmi les packs
// embarqués (script intégré) ; null s'il est refusé
export type ChargerPack = (code: string) => Promise<Pack | null>;
// bouton : false quand le service préfère son propre interrupteur (window.Mayem)
export interface Reglages { chargerPack: ChargerPack; bouton?: boolean }

const IGNORES = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT_VALUE', 'CODE', 'PRE', 'svg', 'SVG']);
const ATTRIBUTS = ['placeholder', 'title', 'aria-label'];
const MARQUES = ['data-mayem', 'data-mayem-critique', 'data-mayem-cat', 'data-mayem-glose', 'data-mayem-termes', 'data-mayem-court', 'data-mayem-deborde'];
// lang d'origine d'un élément traduit, rendu quand on change de langue (vide : il n'en avait pas)
const LANG_ORIGINE = 'data-mayem-lang';
// Balises de mise en forme : le texte qu'elles coupent est lu comme un seul bloc
const EN_LIGNE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'DATA', 'EM', 'FONT', 'I', 'LABEL', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U']);

let pack: Pack;
let options: Options;
let chargerPack: ChargerPack;
let ui: Interface | null = null;
let afficheTraduit = true;
// Termes reconnus dans une phrase inconnue, affichés en CSS à côté d'elle (case du panneau)
let glosesVisibles = true;
let observateur: MutationObserver;
// Le document et chaque Shadow DOM ouvert déjà parcouru
const racines: (Document | ShadowRoot)[] = [];

// Feuille de style.css, intégrée par tools/compile.js : le style injecté dans le document
// ne traverse pas la frontière d'un Shadow DOM
declare const STYLE_PAGE: string;
// nœud texte -> texte d'origine et texte traduit, pour pouvoir revenir en arrière
const ecrits = new Map<Text, { origine: string; traduit: string }>();

const dansNotreUi = (el: Element) => el.closest(`#${ID_HOTE}`);
const modifiable = (el: Element) => el.closest('[contenteditable]:not([contenteditable="false"])');

// Libellé de menu ou de bouton : une glose écrite à sa suite l'élargirait et déplacerait la page
const estCourt = (texte: string) => texte.trim().split(/\s+/).length <= 4 && !/[.!?…]$/.test(texte.trim());

function marquer(el: Element, res: Resultat, texte: string) {
  for (const nom of MARQUES) el.removeAttribute(nom);
  el.setAttribute('data-mayem', res.statut);
  if (res.critique) el.setAttribute('data-mayem-critique', '1');
  if (res.statut === 'ok') {
    if (!el.hasAttribute(LANG_ORIGINE)) el.setAttribute(LANG_ORIGINE, el.getAttribute('lang') ?? '');
    el.setAttribute('lang', pack.langue);
  }
  // Contenu inédit : étiquette validée affichée en CSS (::before), donc hors du texte
  // de la page : aucune valeur ni aucun texte d'origine n'est touché.
  if (res.categorie) {
    const texte = etiquette(res.categorie, pack, options);
    if (texte) el.setAttribute('data-mayem-cat', texte);
  }
  // Le texte reste en français ; seuls ses termes validés sont donnés, dans un pseudo-élément :
  // à sa suite pour une phrase, au survol ou au clavier pour un libellé court
  if (res.termes?.length) {
    const glose = res.termes.map((t) => `${t.fr} : ${t.traduction}`).join(' · ');
    el.setAttribute('data-mayem-glose', glose);
    if (estCourt(texte)) el.setAttribute('data-mayem-court', '1');
    if (glosesVisibles) el.setAttribute('data-mayem-termes', glose);
  }
}

function montrerGloses(visibles: boolean) {
  glosesVisibles = visibles;
  for (const el of racines.flatMap((racine) => [...racine.querySelectorAll('[data-mayem-glose]')])) {
    if (visibles) el.setAttribute('data-mayem-termes', el.getAttribute('data-mayem-glose')!);
    else el.removeAttribute('data-mayem-termes');
  }
}

function ecrire(noeud: Text, sortie: string, brut = noeud.nodeValue || '') {
  // On garde les espaces autour du texte : la mise en page en dépend parfois
  const traduit = brut.match(/^\s*/)![0] + sortie + brut.match(/\s*$/)![0];
  ecrits.set(noeud, { origine: brut, traduit });
  if (afficheTraduit && noeud.nodeValue !== traduit) noeud.nodeValue = traduit;
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

// Texte du service, même si nous l'avons déjà remplacé par la traduction
function origineDe(noeud: Text): string {
  const deja = ecrits.get(noeud);
  return deja && noeud.nodeValue === deja.traduit ? deja.origine : noeud.nodeValue || '';
}

// Le bloc entier est traduit, puis la traduction est rangée dans ses nœuds texte ; faux si impossible
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
  marquer(bloc, res, origines.join(''));
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
    marquer(parent, res, brut);
  } else if (res.id || res.categorie) {
    marquer(parent, res, brut); // original conservé, signalé ; un nom propre n'a ni phrase ni catégorie
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
    if (afficheTraduit) el.setAttribute(nom, res.sortie);
  }
}

function traiterElement(el: Element) {
  traiterAttributs(el);
  if (el.shadowRoot && !dansNotreUi(el)) entrerOmbre(el.shadowRoot);
}

function parcourir(racine: Node) {
  if (racine.nodeType === Node.TEXT_NODE) return traiterTexte(racine as Text);
  const fragment = racine.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  if (!fragment && (racine.nodeType !== Node.ELEMENT_NODE || dansNotreUi(racine as Element))) return;
  if (!fragment) traiterElement(racine as Element);
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) traiterTexte(n as Text);
    else traiterElement(n as Element);
  }
}

// Shadow DOM ouvert : parcouru et surveillé comme le document. Un Shadow DOM fermé
// est inaccessible à toute extension.
function entrerOmbre(ombre: ShadowRoot) {
  if (racines.includes(ombre)) return;
  racines.push(ombre);
  try {
    const feuille = new CSSStyleSheet();
    feuille.replaceSync(STYLE_PAGE);
    ombre.adoptedStyleSheets = [...ombre.adoptedStyleSheets, feuille];
  } catch {
    // Navigateur sans feuilles adoptables : la traduction marche, sans étiquette visible
  }
  observer(ombre);
  parcourir(ombre);
}

function observer(racine: Node) {
  observateur.observe(racine, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRIBUTS,
  });
}

// Messages aux cadres enfants : chacun a sa propre copie de Mayem, sans bouton.
// Ils ne portent qu'un booléen ou un code de langue ; une page qui les imiterait ne ferait que
// basculer l'affichage ou changer de langue, et le pack vient toujours du script de fond.
function prevenirCadres(message: { mayem: boolean } | { mayemLangue: string }) {
  for (let i = 0; i < window.frames.length; i++) window.frames[i].postMessage(message, '*');
}

function basculer(traduit: boolean) {
  afficheTraduit = traduit;
  for (const [noeud, e] of ecrits) {
    if (!noeud.isConnected) ecrits.delete(noeud);
    else noeud.nodeValue = traduit ? e.traduit : e.origine;
  }
  const selecteur = ATTRIBUTS.map((nom) => `[data-mayem-origine-${nom}]`).join(',');
  racines.flatMap((racine) => [...racine.querySelectorAll(selecteur)]).forEach((el) => {
    for (const nom of ATTRIBUTS) {
      const valeur = el.getAttribute(`data-mayem-${traduit ? 'traduit' : 'origine'}-${nom}`);
      if (valeur !== null) el.setAttribute(nom, valeur);
    }
  });
  prevenirCadres({ mayem: traduit });
  prevoirCompteurs();
}

// Remet la page exactement comme le service l'a écrite : textes, attributs, marques et lang
function effacer() {
  for (const [noeud, e] of ecrits) if (noeud.isConnected && noeud.nodeValue === e.traduit) noeud.nodeValue = e.origine;
  ecrits.clear();
  const selecteur = ['[data-mayem]', `[${LANG_ORIGINE}]`, ...ATTRIBUTS.map((nom) => `[data-mayem-origine-${nom}]`)].join(',');
  for (const el of racines.flatMap((racine) => [...racine.querySelectorAll(selecteur)])) {
    for (const nom of ATTRIBUTS) {
      const origine = el.getAttribute(`data-mayem-origine-${nom}`);
      if (origine !== null) el.setAttribute(nom, origine);
      el.removeAttribute(`data-mayem-origine-${nom}`);
      el.removeAttribute(`data-mayem-traduit-${nom}`);
    }
    for (const nom of MARQUES) el.removeAttribute(nom);
    const lang = el.getAttribute(LANG_ORIGINE);
    if (lang !== null) lang ? el.setAttribute('lang', lang) : el.removeAttribute('lang');
    el.removeAttribute(LANG_ORIGINE);
  }
}

// Nouvelle langue : la page revient à l'original, puis tout est retraduit avec le nouveau pack
function appliquer(nouveau: Pack) {
  effacer();
  pack = nouveau;
  afficheTraduit = true;
  for (const racine of racines) parcourir(racine === document ? document.body : racine);
  observateur.takeRecords(); // nos propres écritures, déjà traitées
  prevoirCompteurs();
}

export async function changerLangue(code: string) {
  prevenirCadres({ mayemLangue: code });
  const nouveau = await chargerPack(code);
  if (!nouveau) return; // pack refusé par le script de fond : la langue actuelle reste
  appliquer(nouveau);
  ui?.langueAffichee({ langue: nouveau.langue, nom: nouveau.nom });
}

// Boîte qui contient le texte traduit : le premier élément qui n'est pas en ligne
function boiteDe(el: Element): Element | null {
  for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).display !== 'inline') return e;
  return null;
}
const deborde = (boite: Element) => boite.scrollWidth > boite.clientWidth + 1 || boite.scrollHeight > boite.clientHeight + 1;

// Traduction plus longue que sa boîte (texte coupé, points de suspension, débordement visible).
// On ne fait que lire les dimensions ; la marque sert au contour de la version pseudo et aux tests.
function compterDebordements(): number {
  let total = 0;
  for (const el of racines.flatMap((racine) => [...racine.querySelectorAll('[data-mayem="ok"],[data-mayem="test"]')])) {
    const boite = boiteDe(el);
    const trop = afficheTraduit && !!boite && deborde(boite);
    if (trop !== el.hasAttribute('data-mayem-deborde')) el.toggleAttribute('data-mayem-deborde', trop);
    if (trop) total++;
  }
  return total;
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
    const conserves = racines.reduce((n, racine) => n + racine.querySelectorAll('[data-mayem="non_verifie"],[data-mayem="rejete"]').length, 0);
    const chiffres = ecarts ? `${ecarts} écart(s) !` : `${verifies} ✓`;
    ui?.afficherCompteurs({ traduits, conserves, chiffres, debordements: compterDebordements() });
  });
}

// Nouveau clic sur l'icône une fois Mayem lancé : original <-> traduction
export function inverser() {
  if (ui) ui.inverser();
  else basculer(!afficheTraduit);
}

export function demarrer(lePack: Pack, lesOptions: Options, langues: Langue[], reglages: Reglages) {
  pack = lePack;
  options = lesOptions;
  chargerPack = reglages.chargerPack;
  // Un seul bouton, dans la page principale ; un cadre suit la bascule et la langue de son parent
  if (window === window.top) {
    if (reglages.bouton !== false) {
      ui = creerInterface(!!options.test, langues, { langue: pack.langue, nom: pack.nom }, { basculer, changerLangue, montrerGloses });
    }
  } else {
    window.addEventListener('message', (evenement) => {
      if (evenement.source !== window.parent) return;
      if (typeof evenement.data?.mayem === 'boolean') basculer(evenement.data.mayem);
      if (typeof evenement.data?.mayemLangue === 'string') changerLangue(evenement.data.mayemLangue);
    });
  }
  observateur = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') traiterTexte(m.target as Text);
      else if (m.type === 'attributes') traiterAttributs(m.target as Element);
      else m.addedNodes.forEach(parcourir);
    }
  });
  racines.push(document);
  // Une fenêtre plus étroite peut faire déborder une traduction qui tenait
  window.addEventListener('resize', prevoirCompteurs);
  observer(document.body);
  parcourir(document.body);
  prevoirCompteurs();
}
