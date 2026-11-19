// Met api/ en ligne sur Cloudflare, après contrôle, puis sonde l'adresse publique.
// Usage : npm run api, puis npm run deployer   (npm run deployer -- --recuperer : voir plus bas)
// Avant d'envoyer : signatures de api/ vérifiées, aucun nom de traducteur, api/ à jour du pack, et chaque
// version déjà en ligne identique octet pour octet à celle de api/. Une signature ECDSA change à chaque
// calcul : sans ce dernier contrôle, un api/ perdu puis refait (autre poste) changerait des versions publiées.
// --recuperer : copie dans api/ les versions en ligne qui y manquent, pour republier sans rien changer.

import { request } from 'node:https';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifierOctets, verifierSignature } from '../core/signature.ts';
import { dossier, langues, racine } from './langues.js';
import { nomsInternes } from './public.js';
import { lireCles } from './signature.js';
import { ADRESSE, cheminEnLigne, espaceCles, wrangler } from './cloudflare.js';

const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const fichiers = (ici) => readdirSync(ici).flatMap((nom) => (statSync(join(ici, nom)).isDirectory() ? fichiers(join(ici, nom)) : [join(ici, nom)]));

// Versions figées que liste une API (en ligne ou locale) : chemins relatifs à v1/
async function figees(lire) {
  const langues = JSON.parse((await lire('langues.json')) || '[]');
  const chemins = [];
  for (const { langue } of langues) {
    for (const { pack } of JSON.parse(await lire(`langues/${langue}.json`)).versions) chemins.push(pack);
  }
  const script = await lire('script/index.json');
  for (const { version } of script ? JSON.parse(script).versions : []) chemins.push(`script/${version}/mayem.js`, `script/${version}/signature.json`);
  return chemins;
}

// distant(chemin) : contenu en ligne (Buffer) ou null. Rend les écarts et les chemins absents de api/.
export async function ecarts(v1, distant) {
  const differents = [];
  const manquants = [];
  for (const chemin of await figees(async (c) => (await distant(c))?.toString('utf8') ?? null)) {
    const enLigne = await distant(chemin);
    if (!existsSync(v1 + chemin)) manquants.push(chemin);
    else if (!enLigne || !readFileSync(v1 + chemin).equals(enLigne)) differents.push(chemin);
  }
  return { differents, manquants };
}

export async function controler(v1) {
  const erreurs = [];
  const cles = lireCles();
  for (const chemin of await figees(async (c) => (existsSync(v1 + c) ? readFileSync(v1 + c, 'utf8') : null))) {
    if (chemin.endsWith('/signature.json')) continue;
    if (chemin.startsWith('script/')) {
      const fiche = lireJson(v1 + chemin.replace(/mayem\.js$/, 'signature.json'));
      const raison = await verifierOctets(readFileSync(v1 + chemin), fiche.signature, cles);
      if (raison) erreurs.push(`${chemin} : ${raison}`);
    } else {
      for (const raison of await verifierSignature(lireJson(v1 + chemin), cles)) erreurs.push(`${chemin} : ${raison}`);
    }
  }
  const resumes = lireJson(v1 + 'langues.json');
  for (const langue of langues()) {
    const pack = lireJson(dossier(langue) + 'pack.json');
    const publie = resumes.find((r) => r.langue === langue)?.derniere.version;
    if (publie !== pack.version) erreurs.push(`${langue} : api/ a ${publie || 'rien'}, le pack est en ${pack.version} (npm run api)`);
    const noms = nomsInternes(pack).flatMap((nom) => nom.split(/\s+(?:et|and)\s+|,/)).map((nom) => nom.trim()).filter((nom) => nom.length > 2);
    for (const fichier of fichiers(dirname(v1))) {
      const contenu = readFileSync(fichier, 'utf8');
      for (const nom of noms) if (contenu.includes(nom)) erreurs.push(`nom interne dans ${fichier}`);
    }
  }
  return erreurs;
}

// Requête brute : le chemin part tel quel, sans être normalisé par fetch (sondes de contournement)
function brut(adresse, chemin, entetes = {}) {
  return new Promise((resoudre, rejeter) => {
    const { hostname } = new URL(adresse);
    const req = request({ hostname, path: chemin, headers: entetes }, (rep) => {
      const morceaux = [];
      rep.on('data', (m) => morceaux.push(m));
      rep.on('end', () => resoudre({ statut: rep.statusCode, entetes: rep.headers, corps: Buffer.concat(morceaux) }));
    });
    req.on('error', rejeter);
    req.end();
  });
}

const distantDe = (adresse) => async (chemin) => {
  const rep = await brut(adresse, cheminEnLigne('/v1/' + chemin));
  return rep.statut === 200 ? rep.corps : null;
};

// Après l'envoi : le public est servi et vérifiable, les exports refusés sans clé, par tous les chemins
export async function sonder(adresse, v1) {
  const erreurs = [];
  const derniere = lireJson(v1 + 'langues.json')[0];
  const pack = await brut(adresse, `/v1/packs/${derniere.langue}/latest.json`);
  if (pack.statut !== 200) erreurs.push(`pack : ${pack.statut}`);
  else if ((await verifierSignature(JSON.parse(pack.corps), lireCles())).length) erreurs.push('pack en ligne non vérifié');
  if (pack.entetes['access-control-allow-origin'] !== '*') erreurs.push('pack : accès depuis les autres sites fermé');
  const exports = lireJson(`${v1}langues/${derniere.langue}.json`).exports;
  const reste = (exports.find((e) => !e.includes('+')) || exports[0]).replace(/^exports\//, '');
  const tentatives = [`/v1/exports/${reste}`, `/v1/%65xports/${reste}`, `/V1/EXPORTS/${reste}`, `/v1//exports/${reste}`,
    `/v1/packs/../exports/${reste}`, `/v1/packs/%2e%2e/exports/${reste}`, `/v1/packs/..%2fexports/${reste}`, `/v1/./exports/${reste}`, `/v1\\exports\\${reste}`];
  for (const chemin of tentatives) {
    const rep = await brut(adresse, chemin);
    if (rep.statut === 200) erreurs.push(`export servi sans clé : ${chemin}`);
  }
  return erreurs;
}

async function recuperer(adresse, v1) {
  const distant = distantDe(adresse);
  const { manquants } = await ecarts(v1, distant);
  for (const chemin of manquants) {
    mkdirSync(dirname(v1 + chemin), { recursive: true });
    writeFileSync(v1 + chemin, await distant(chemin));
  }
  console.log(manquants.length ? `${manquants.length} versions en ligne copiées dans api/. Lancer npm run api puis npm run deployer.` : 'Rien ne manque dans api/.');
}

async function deployer(v1) {
  espaceCles();
  const erreurs = await controler(v1);
  if (erreurs.length) throw new Error(['Rien n\'est envoyé :', ...erreurs].join('\n- '));
  const adresse = existsSync(ADRESSE) ? readFileSync(ADRESSE, 'utf8').trim() : '';
  if (adresse) {
    const { differents, manquants } = await ecarts(v1, distantDe(adresse));
    if (manquants.length) throw new Error(`Versions en ligne absentes de api/ : ${manquants.join(', ')}. Lancer npm run deployer -- --recuperer.`);
    if (differents.length) throw new Error(`Une version publiée ne change jamais ; différentes en ligne : ${differents.join(', ')}.`);
  }
  const envoi = wrangler(['deploy']);
  if (envoi.status !== 0) throw new Error('wrangler deploy a échoué (connexion : npx wrangler login).');
  const nouvelle = adresse || envoi.stdout.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
  if (!nouvelle) throw new Error('Adresse publique introuvable dans la sortie de wrangler : l\'écrire dans hebergement/adresse.txt.');
  if (!adresse) writeFileSync(ADRESSE, nouvelle + '\n');
  const sondes = await sonder(nouvelle, v1);
  if (sondes.length) throw new Error(['En ligne, mais :', ...sondes].join('\n- '));
  console.log(`En ligne : ${nouvelle}/v1/index.json. Pack signé vérifié depuis l'adresse publique, exports refusés sans clé.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v1 = racine + 'api/v1/';
  try {
    if (process.argv.includes('--recuperer')) {
      if (!existsSync(ADRESSE)) throw new Error('Pas encore d\'adresse publique : rien à récupérer.');
      await recuperer(readFileSync(ADRESSE, 'utf8').trim(), v1);
    } else {
      if (!existsSync(v1 + 'langues.json')) throw new Error('api/ absent : npm run api');
      await deployer(v1);
    }
  } catch (erreur) {
    console.error(erreur.message);
    process.exit(1);
  }
}
