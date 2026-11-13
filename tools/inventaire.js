// Inventaire d'un ou de plusieurs services : ouvre leurs pages dans un navigateur, relève tous les textes que
// Mayem verrait, mesure ce qui est déjà repris du pack et liste ce qui manque, faits masqués ({amount}, {date}…),
// regroupé, les textes communs à plusieurs services d'abord.
// Usage : npm run inventaire -- <adresse ou fichier.html>… [--langue <code>] [--profil <fichier.json>] [--ajouter [--etat <liste>]]
//   -> packs/<langue>/a-traduire.csv ; avec --ajouter, les modèles manquants entrent aussi dans corpus.csv
//      (sans traduction) : python tools/kit.py export les envoie alors aux locuteurs.
//   --etat proche : seuls les textes proches d'une entrée validée (pluriels, variantes) sont ajoutés. Un pluriel
//      validé ainsi est une phrase du corpus comme une autre : le singulier n'est jamais affiché à sa place.
//   --profil : profil du service, { "ne_pas_traduire": ["Nom de marque", …] } ; ces textes sortent de l'inventaire.
// Outil de l'équipe, jamais lancé chez un utilisateur : à faire sur des pages d'essai ou un compte de test,
// car un nom de personne n'est pas masqué.

import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
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
// Un service = un site ; une page enregistrée compte pour un service à elle seule
const serviceDe = (cible) => (/^https?:\/\//.test(cible) ? new URL(cible).hostname : basename(cible));

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
const ligneCouverture = ({ traduit, proche, partiel, absent, rejete, total }) =>
  `${total} textes : ${pourcent(traduit, total)} déjà traduits, ${pourcent(proche, total)} proches (à confirmer), ${pourcent(partiel, total)} partiels (termes connus), ${pourcent(absent, total)} nouveaux${rejete ? `, ${rejete} rejetés` : ''}`;

// Ce que les locuteurs ont déjà validé et qui aide pour ce modèle
function consigne(manque) {
  if (manque.proche) return `Ressemble à « ${manque.proche} », déjà traduit : même mot au pluriel ou écrit autrement. Donnez la forme juste pour ce texte.`;
  return manque.termes.length ? `Termes du glossaire : ${manque.termes.join(', ')}` : '';
}

// Nouveaux modèles ajoutés à corpus.csv, sans traduction, avec un id N001, N002…
function ajouterAuCorpus(fichier, manques) {
  const texte = readFileSync(fichier, 'utf8');
  const lignes = lireCsv(texte);
  const entetes = Object.keys(lignes[0]);
  const presents = new Set(lignes.map((l) => l.fr));
  const numeros = lignes.map((l) => Number(l.id.match(/^N(\d+)$/)?.[1] || 0));
  let suivant = Math.max(0, ...numeros) + 1;
  const nouvelles = manques.filter((m) => !presents.has(m.modele)).map((m) => ({
    id: `N${String(suivant++).padStart(3, '0')}`, priorite: 'P2', ecran: 'Inventaire', element: 'Texte relevé sur un service',
    critique: m.categorie && m.categorie !== 'info' ? '1' : '0', champ_fait: /\{\w+\}/.test(m.modele) ? '1' : '0',
    fr: m.modele, en: '', bulu: '', valide_par: '', valide: '', consigne: consigne(m),
  }));
  writeFileSync(fichier, ecrireCsv(entetes, [...lignes, ...nouvelles]));
  return nouvelles.length;
}

const options = process.argv.slice(2);
const langue = choisirLangue(options.includes('--langue') ? options[options.indexOf('--langue') + 1] : undefined);
const profil = options.includes('--profil') ? JSON.parse(readFileSync(options[options.indexOf('--profil') + 1], 'utf8')) : {};
// --etat proche,partiel : seuls ces états partent chez les locuteurs avec --ajouter (les pluriels d'abord, par exemple)
const etats = options.includes('--etat') ? options[options.indexOf('--etat') + 1].split(',') : null;
const cibles = options.filter((o, i) => !o.startsWith('--') && !['--langue', '--profil', '--etat'].includes(options[i - 1]));
if (!cibles.length) {
  console.error('Usage : npm run inventaire -- <adresse ou fichier.html>… [--langue <code>] [--profil <fichier.json>] [--ajouter [--etat <liste>]]');
  process.exit(1);
}
const ici = dossier(langue);
const pack = JSON.parse(readFileSync(ici + 'pack.json', 'utf8'));
const intacts = profil.ne_pas_traduire || [];
const pages = await relever(cibles);
for (const { cible, textes } of pages) console.log(`${cible}\n  ${ligneCouverture(inventorier(textes, pack, { intacts }).couverture)}`);
const services = pages.flatMap((p) => p.textes.map(() => serviceDe(p.cible)));
const rapport = inventorier(pages.flatMap((p) => p.textes), pack, { services, intacts });
console.log(`\nEnsemble : ${ligneCouverture(rapport.couverture)}`);
const communs = rapport.manques.filter((m) => m.services > 1).length;
if (new Set(services).size > 1) console.log(`${communs} modèles communs à plusieurs services, en tête de liste : les traduire une fois sert à tous`);
const muets = rapport.manques.filter((m) => !m.categorie && m.etat !== 'rejete').length;
if (muets) console.log(`${muets} modèles que Mayem ne signale pas dans la page (noms propres, marques ou libellés sans mot connu) : colonne « categorie » vide`);
writeFileSync(ici + 'a-traduire.csv', ecrireCsv(['modele', 'occurrences', 'services', 'etat', 'proche', 'categorie', 'termes'],
  rapport.manques.map((m) => ({ ...m, termes: m.termes.join(' | ') }))));
console.log(`${rapport.manques.length} modèles à traduire -> packs/${langue}/a-traduire.csv`);
if (rapport.motsAbsents.length) console.log(`Mots absents du corpus et du glossaire : ${rapport.motsAbsents.slice(0, 30).map((m) => m.mot).join(', ')}`);
if (options.includes('--ajouter') && existsSync(ici + 'corpus.csv')) {
  const choisis = rapport.manques.filter((m) => !etats || etats.includes(m.etat));
  console.log(`${ajouterAuCorpus(ici + 'corpus.csv', choisis)} modèles ajoutés à packs/${langue}/corpus.csv, sans traduction : python tools/kit.py export`);
}
