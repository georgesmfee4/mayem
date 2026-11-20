// Prépare l'API v1 dans api/ : de simples fichiers signés, servis tels quels par un hébergement statique.
// Usage : npm run api   (après npm run cle, une seule fois)
// Elle sert les intégrateurs (script en une ligne, applis), et ceux qui réutilisent les données. L'extension
// ne l'appelle pas, et l'API ne reçoit jamais rien des pages des usagers : la traduction reste sur l'appareil.
// Une version publiée ne change jamais : republier la même version garde ses octets et sa signature ;
// un contenu différent sous un numéro déjà publié arrête tout. Aucun nom de traducteur (tools/public.js).
// Rien n'est mis en ligne ici.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifierOctets, verifierSignature } from '../core/signature.ts';
import { dossier, langues, racine } from './langues.js';
import { ecrireExports } from './export.js';
import { mentionDroits, validees } from './exports/commun.js';
import { versPublic } from './public.js';
import { cheminEnLigne } from './cloudflare.js';
import { chargerCle, lireCles, signerOctets, signerPack } from './signature.js';

const DROITS = 'Données de l\'équipe Mayem, tous droits réservés. Utilisation selon les conditions de l\'API Mayem (docs/API.md).';
const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const ecrireJson = (chemin, objet) => writeFileSync(chemin, JSON.stringify(objet, null, 2) + '\n');
const sansSignature = ({ signature: _signature, ...reste }) => reste;
const parVersion = (a, b) => a.split('.').map(Number).reduce((ecart, n, i) => ecart || n - Number(b.split('.')[i]), 0);

// Version figée d'un pack : gardée telle quelle si elle est déjà publiée et bien signée
async function figerPack(chemin, pack, cle, cles) {
  if (existsSync(chemin)) {
    const deja = lireJson(chemin);
    if (JSON.stringify(sansSignature(deja)) !== JSON.stringify(sansSignature(pack))) {
      throw new Error(`${chemin} : une version publiée ne change jamais. Fabriquer une nouvelle version du pack.`);
    }
    if (!(await verifierSignature(deja, cles)).length) return deja;
  }
  const signe = await signerPack(pack, cle);
  ecrireJson(chemin, signe);
  return signe;
}

async function publierLangue(v1, langue, cle, cles) {
  const ici = `${v1}packs/${langue}/`;
  mkdirSync(ici, { recursive: true });
  const archives = existsSync(dossier(langue) + 'versions') ? readdirSync(dossier(langue) + 'versions').map((nom) => nom.replace(/\.json$/, '')) : [];
  const versions = archives.sort(parVersion);
  const publiees = [];
  for (const version of versions) {
    publiees.push(await figerPack(`${ici}${version}.json`, await versPublic(lireJson(`${dossier(langue)}versions/${version}.json`)), cle, cles));
  }
  const courant = lireJson(dossier(langue) + 'pack.json').version;
  const dernier = publiees.find((p) => p.version === courant);
  if (!dernier) throw new Error(`${langue} ${courant} : version absente de packs/${langue}/versions (npm run pack)`);
  ecrireJson(ici + 'latest.json', dernier);
  rmSync(`${v1}exports/${langue}/`, { recursive: true, force: true });
  const exports = ecrireExports(dernier, `${v1}exports/${langue}/`).map((chemin) => `exports/${langue}/${chemin}`);
  const resume = {
    langue, nom: dernier.nom, producteur: dernier.producteur, droits: mentionDroits(dernier),
    derniere: { version: dernier.version, date: dernier.date, empreinte: dernier.empreinte, format: dernier.format || 1 },
    phrases_validees: validees(dernier).length, termes: dernier.glossaire.filter((t) => t.cible).length,
    liens: { pack: `packs/${langue}/latest.json`, detail: `langues/${langue}.json` },
  };
  mkdirSync(`${v1}langues/`, { recursive: true });
  ecrireJson(`${v1}langues/${langue}.json`, {
    ...resume,
    versions: publiees.map((p) => ({ version: p.version, date: p.date, empreinte: p.empreinte, format: p.format || 1, cle: p.signature.cle, pack: `packs/${langue}/${p.version}.json` })),
    exports,
  });
  return resume;
}

const integrite = async (octets) => 'sha384-' + Buffer.from(await crypto.subtle.digest('SHA-384', octets)).toString('base64');

// Script en une ligne : chaque version figée dans script/<version>/, avec sa signature et son intégrité
async function publierScript(v1, script, cle, cles) {
  const ici = `${v1}script/${script.version}/`;
  mkdirSync(ici, { recursive: true });
  let fiche = existsSync(ici + 'signature.json') ? lireJson(ici + 'signature.json') : null;
  if (existsSync(ici + 'mayem.js') && !Buffer.from(readFileSync(ici + 'mayem.js')).equals(Buffer.from(script.contenu))) {
    throw new Error(`script ${script.version} : une version publiée ne change jamais. Changer la version de Mayem ou du pack.`);
  }
  if (!fiche || (await verifierOctets(script.contenu, fiche.signature, cles))) {
    fiche = { version: script.version, packs: script.packs, integrite: await integrite(script.contenu), signature: await signerOctets(script.contenu, cle) };
  }
  writeFileSync(ici + 'mayem.js', script.contenu);
  ecrireJson(ici + 'signature.json', fiche);
  const versions = readdirSync(`${v1}script/`, { withFileTypes: true }).filter((e) => e.isDirectory())
    .map((e) => lireJson(`${v1}script/${e.name}/signature.json`))
    .map(({ version, packs, integrite: hash, signature }) => ({ version, packs, integrite: hash, cle: signature.cle, script: cheminEnLigne(`script/${version}/mayem.js`) }));
  ecrireJson(`${v1}script/index.json`, { derniere: script.version, versions });
}

// En-têtes de l'hébergement (_headers, lu par Cloudflare) : ouverts à tous les sites, sinon l'intégrité
// sha384 du script ne peut pas être contrôlée chez un intégrateur. Une version figée se garde un an ;
// le reste (latest, index, clés) est revalidé à chaque fois.
const REGLES_MAX = 100; // limite de Cloudflare
function entetes(v1) {
  const figes = readdirSync(v1 + 'packs/').flatMap((langue) => readdirSync(`${v1}packs/${langue}/`)
    .filter((nom) => nom !== 'latest.json').map((nom) => `/v1/packs/${langue}/${nom}`));
  if (existsSync(v1 + 'script/')) {
    figes.push(...readdirSync(v1 + 'script/', { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => cheminEnLigne(`/v1/script/${e.name}/*`)));
  }
  if (figes.length + 1 > REGLES_MAX) throw new Error(`_headers : ${figes.length + 1} règles, Cloudflare en accepte ${REGLES_MAX}.`);
  const tous = '/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n';
  return tous + figes.map((chemin) => `${chemin}\n  Cache-Control: public, max-age=31536000, immutable\n`).join('');
}

function page(langues) {
  const lignes = langues.map((l) => `<li><strong>${l.nom}</strong> (${l.langue}) ${l.derniere.version}, ${l.phrases_validees} phrases validées : <a href="v1/${l.liens.pack}">pack</a>, <a href="v1/${l.liens.detail}">versions</a></li>`);
  return `<!doctype html>\n<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>API Mayem</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem">
<h1>API Mayem v1</h1>
<p>Packs de langue et script d'intégration, signés par l'équipe Mayem. Point d'entrée : <a href="v1/index.json">v1/index.json</a> ;
contrat : <a href="v1/openapi.json">v1/openapi.json</a> ; clés de vérification : <a href="v1/cles-publiques.json">v1/cles-publiques.json</a>.
L'API ne reçoit aucun texte des pages : la traduction se fait sur l'appareil.</p>
<p><strong>${DROITS}</strong></p>
<ul>\n${lignes.join('\n')}\n</ul>\n</body></html>\n`;
}

// sortie : dossier de l'API ; script : { version, packs, contenu } ; coeur : dist-lib/mayem-core.js (outil de l'intégrateur)
export async function publier({ sortie, cle, cles, script = null, coeur = null }) {
  const v1 = sortie + 'v1/';
  // Ancienne disposition, jamais mise en ligne : remplacée par v1/
  for (const ancien of ['packs', 'exports', 'index.json', 'schema.json']) rmSync(sortie + ancien, { recursive: true, force: true });
  mkdirSync(v1, { recursive: true });
  const resumes = [];
  for (const langue of langues()) resumes.push(await publierLangue(v1, langue, cle, cles));
  if (script) await publierScript(v1, script, cle, cles);
  ecrireJson(v1 + 'cles-publiques.json', { cles });
  cpSync(racine + 'packs/schema.json', v1 + 'schema.json');
  cpSync(racine + 'docs/openapi.json', v1 + 'openapi.json');
  if (coeur) {
    mkdirSync(v1 + 'outils/', { recursive: true });
    writeFileSync(v1 + 'outils/mayem-core.js', coeur);
    const modele = readFileSync(racine + 'tools/modele-verifier.mjs', 'utf8');
    writeFileSync(v1 + 'outils/mayem-verifier.mjs', modele.replace('/* CLES */[]', JSON.stringify(cles.filter((c) => c.statut !== 'revoquee'))));
  }
  ecrireJson(v1 + 'langues.json', resumes);
  ecrireJson(v1 + 'index.json', {
    api: 'v1', producteur: 'Équipe Mayem', droits: DROITS,
    liens: { langues: 'langues.json', script: script ? 'script/index.json' : null, cles: 'cles-publiques.json', schema: 'schema.json', openapi: 'openapi.json', outil: coeur ? 'outils/mayem-verifier.mjs' : null },
  });
  writeFileSync(sortie + 'index.html', page(resumes));
  writeFileSync(sortie + '_headers', entetes(v1));
  return resumes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const cle = await chargerCle();
    const construction = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', racine + 'tools/compile.js'], { stdio: 'inherit' });
    if (construction.status !== 0) process.exit(1);
    const packs = lireJson(racine + 'dist/packs/index.json').map(({ langue, version }) => ({ langue, version }));
    const { version } = lireJson(racine + 'package.json');
    const script = { version: `${version}+${packs.map((p) => `${p.langue}.${p.version}`).join('.')}`, packs, contenu: readFileSync(racine + 'dist-web/mayem.js') };
    const resumes = await publier({ sortie: racine + 'api/', cle, cles: lireCles(), script, coeur: readFileSync(racine + 'dist-lib/mayem-core.js', 'utf8') });
    console.log(`API v1 prête dans api/ : ${resumes.map((l) => `${l.langue} ${l.derniere.version}`).join(', ')}, script ${script.version}, clé ${cle.id}.`);
    console.log('Aucun nom de traducteur. Rien n\'est en ligne.');
  } catch (erreur) {
    console.error(erreur.message);
    process.exit(1);
  }
}

