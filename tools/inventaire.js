// Inventaire d'un service : ouvre ses pages dans un navigateur, relève tous les textes que Mayem verrait,
// mesure la couverture et liste ce qui manque, faits masqués ({amount}, {date}…), regroupé et classé par fréquence.
// Usage : npm run inventaire -- <adresse ou fichier.html>… [--langue <code>] [--ajouter]
//   -> packs/<langue>/a-traduire.csv ; avec --ajouter, les modèles manquants entrent aussi dans corpus.csv
//      (sans traduction) : python tools/kit.py export les envoie alors aux locuteurs.
// Outil de l'équipe, jamais lancé chez un utilisateur : à faire sur des pages d'essai ou un compte de test,
// car un nom de personne n'est pas masqué.

import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inventorier } from '../core/inventaire.ts';
import { ecrireCsv, lireCsv } from './csv.js';
import { choisirLangue, dossier } from './langues.js';

// Exécuté dans la page : textes visibles par Mayem, un bloc coupé par des balises de mise en forme comptant pour un
function releverTextes() {
  const IGNORES = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'TEMPLATE', 'svg', 'SVG']);
  const EN_LIGNE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'DATA', 'EM', 'FONT', 'I', 'LABEL', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U']);
  const textes = [];
  const blocs = new Set();
  const queDuTexte = (el) => [...el.querySelectorAll('*')].every((enfant) => EN_LIGNE.has(enfant.tagName));
  const blocDe = (el) => {
    let bloc = null;
    for (let e = el; e && e !== document.body && queDuTexte(e); e = e.parentElement) {
      bloc = e;
      if (!EN_LIGNE.has(e.tagName)) break;
    }
    return bloc && bloc.childNodes.length > 1 ? bloc : null;
  };
  const lire = (racine) => {
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        for (const nom of ['placeholder', 'title', 'aria-label']) if (n.getAttribute(nom)) textes.push(n.getAttribute(nom));
        if (n.shadowRoot) lire(n.shadowRoot);
        continue;
      }
      const parent = n.parentElement;
      if (!parent || IGNORES.has(parent.tagName) || !n.nodeValue.trim() || parent.closest('[contenteditable]:not([contenteditable="false"])')) continue;
      const bloc = blocDe(parent);
      if (!bloc) textes.push(n.nodeValue);
      else if (!blocs.has(bloc)) { blocs.add(bloc); textes.push(bloc.textContent); }
    }
  };
  lire(document.body);
  return textes;
}

const adresse = (cible) => (/^https?:\/\//.test(cible) ? cible : pathToFileURL(resolve(cible)).href);

async function relever(cibles) {
  const navigateur = await chromium.launch({ channel: process.env.NAVIGATEUR || (process.platform === 'win32' ? 'msedge' : 'chromium') });
  const parPage = [];
  try {
    const page = await navigateur.newPage();
    for (const cible of cibles) {
      await page.goto(adresse(cible), { waitUntil: 'networkidle' });
      const parCadre = await Promise.all(page.frames().map((cadre) => cadre.evaluate(releverTextes).catch(() => [])));
      parPage.push({ cible, textes: parCadre.flat() });
    }
  } finally {
    await navigateur.close();
  }
  return parPage;
}

const pourcent = (n, total) => (total ? Math.round((100 * n) / total) : 0) + ' %';
const ligneCouverture = ({ traduit, partiel, absent, rejete, total }) =>
  `${total} textes : ${pourcent(traduit, total)} traduits, ${pourcent(partiel, total)} partiels (termes connus), ${pourcent(absent, total)} absents${rejete ? `, ${rejete} rejetés` : ''}`;

// Nouveaux modèles ajoutés à corpus.csv, sans traduction, avec un id N001, N002…
function ajouterAuCorpus(fichier, manques) {
  const texte = readFileSync(fichier, 'utf8');
  const lignes = lireCsv(texte);
  const entetes = Object.keys(lignes[0]);
  const presents = new Set(lignes.map((l) => l.fr));
  const numeros = lignes.map((l) => Number(l.id.match(/^N(\d+)$/)?.[1] || 0));
  let suivant = Math.max(0, ...numeros) + 1;
  const nouvelles = manques.filter((m) => !presents.has(m.modele)).map((m) => ({
    id: `N${String(suivant++).padStart(3, '0')}`, priorite: 'P2', ecran: 'Inventaire', element: m.etat,
    critique: m.categorie && m.categorie !== 'info' ? '1' : '0', champ_fait: /\{\w+\}/.test(m.modele) ? '1' : '0',
    fr: m.modele, en: '', bulu: '', valide_par: '', valide: '', consigne: m.termes.length ? `Termes du glossaire : ${m.termes.join(', ')}` : '',
  }));
  writeFileSync(fichier, ecrireCsv(entetes, [...lignes, ...nouvelles]));
  return nouvelles.length;
}

const options = process.argv.slice(2);
const langue = choisirLangue(options.includes('--langue') ? options[options.indexOf('--langue') + 1] : undefined);
const cibles = options.filter((o, i) => !o.startsWith('--') && options[i - 1] !== '--langue');
if (!cibles.length) {
  console.error('Usage : npm run inventaire -- <adresse ou fichier.html>… [--langue <code>] [--ajouter]');
  process.exit(1);
}
const ici = dossier(langue);
const pack = JSON.parse(readFileSync(ici + 'pack.json', 'utf8'));
const pages = await relever(cibles);
for (const { cible, textes } of pages) console.log(`${cible}\n  ${ligneCouverture(inventorier(textes, pack).couverture)}`);
const rapport = inventorier(pages.flatMap((p) => p.textes), pack);
console.log(`\nEnsemble : ${ligneCouverture(rapport.couverture)}`);
writeFileSync(ici + 'a-traduire.csv', ecrireCsv(['modele', 'occurrences', 'etat', 'categorie', 'termes'],
  rapport.manques.map((m) => ({ ...m, termes: m.termes.join(' | ') }))));
console.log(`${rapport.manques.length} modèles à traduire -> packs/${langue}/a-traduire.csv`);
if (rapport.motsAbsents.length) console.log(`Mots absents du corpus et du glossaire : ${rapport.motsAbsents.slice(0, 30).map((m) => m.mot).join(', ')}`);
if (options.includes('--ajouter') && existsSync(ici + 'corpus.csv')) {
  console.log(`${ajouterAuCorpus(ici + 'corpus.csv', rapport.manques)} modèles ajoutés à packs/${langue}/corpus.csv, sans traduction : python tools/kit.py export`);
}
