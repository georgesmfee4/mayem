// Mayem intégré à un site, sans extension :
//   <script src="mayem.js" integrity="sha384-…" data-langue="<code de la langue>" defer></script>
// Les packs sont dans le fichier (tools/compile.js) : une fois le script chargé, aucune requête réseau.
// Mêmes garanties que l'extension : pack vérifié (règles et empreinte) avant de toucher la page,
// seules les traductions validées s'affichent, aucun champ de saisie lu, rien n'est stocké.
// Réglages : data-langue (langue de départ), data-bouton="non" (le service a son propre interrupteur),
// data-auto="non" (attendre Mayem.demarrer()).

import type { Pack } from '../core/types.ts';
import { empreinte } from '../core/empreinte.ts';
import { verifierPack, type Regle } from '../core/verifier.ts';
import { changerLangue, demarrer, inverser } from './page.ts';

declare const PACKS_EMBARQUES: Pack[];
declare const SCHEMA_EMBARQUE: Regle;
declare const STYLE_PAGE: string;

// Lu tout de suite : document.currentScript n'existe que pendant l'exécution du script
const balise = document.currentScript as HTMLScriptElement | null;
const reglage = (nom: string) => balise?.dataset[nom];
const languesEmbarquees = () => PACKS_EMBARQUES.map(({ langue, nom }) => ({ langue, nom }));
let actif = false;
let lance = false;
// Raison du dernier refus, pour Mayem.etat() ; le service peut aussi écouter l'événement « mayem-refus »
let refus: string | null = null;

async function packEmbarque(code: string): Promise<Pack | null> {
  const pack = PACKS_EMBARQUES.find((p) => p.langue === code);
  if (!pack) return null;
  const erreurs = verifierPack(pack, SCHEMA_EMBARQUE);
  // Web Crypto n'existe qu'en contexte sécurisé (https) : un service financier y est de toute façon
  if (!erreurs.length && !globalThis.crypto?.subtle) erreurs.push('page non sécurisée (https requis) : empreinte invérifiable');
  else if (!erreurs.length && (await empreinte(pack)) !== pack.empreinte) erreurs.push('empreinte différente : pack modifié après sa fabrication');
  if (erreurs.length) {
    console.error(`Mayem : pack ${code} refusé, la page reste intacte.\n` + erreurs.join('\n'));
    refus = erreurs[0];
    document.dispatchEvent(new CustomEvent('mayem-refus', { detail: { langue: code, raisons: erreurs } }));
    return null;
  }
  return pack;
}

// Style des marques par une feuille adoptée : aucun élément ajouté dans la page
function adopterStyle() {
  const feuille = new CSSStyleSheet();
  feuille.replaceSync(STYLE_PAGE);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, feuille];
}

async function lancer() {
  if (lance) return;
  lance = true;
  const pack = await packEmbarque(reglage('langue') || PACKS_EMBARQUES[0]?.langue || '');
  if (!pack) return;
  adopterStyle();
  demarrer(pack, { test: false }, languesEmbarquees(), { chargerPack: packEmbarque, bouton: reglage('bouton') !== 'non' });
  actif = true;
}

const quandPret = (rappel: () => void) =>
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', rappel, { once: true }) : rappel();

(globalThis as { Mayem?: unknown }).Mayem = Object.freeze({
  demarrer: () => quandPret(lancer),
  inverser: () => actif && inverser(),
  choisirLangue: (code: string) => (actif ? changerLangue(code) : undefined),
  langues: languesEmbarquees,
  etat: () => ({ actif, refus }),
});
if (reglage('auto') !== 'non') quandPret(lancer);
