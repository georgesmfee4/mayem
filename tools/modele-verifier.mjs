// Outil de l'intégrateur Mayem (modèle : tools/api.js le publie dans api/v1/outils/ avec les clés de confiance).
// Récupère un pack ou le script Mayem, ou lit un fichier, et ne le garde que s'il est intact et signé par
// l'équipe Mayem. Node 18 ou plus, sans dépendance ; à lancer au moment de construire son site ou son appli.
//   node mayem-verifier.mjs https://…/v1/packs/bum/0.6.0.json --sortie pack.json
//   node mayem-verifier.mjs https://…/v1/script/<version>/mayem.js --sortie mayem.js   (lit signature.json à côté)
// Rien n'est écrit si la vérification échoue. Avant le premier usage, comparer l'identifiant des clés
// ci-dessous à celui que publie la documentation Mayem.

import { readFile, writeFile } from 'node:fs/promises';
import { verifierOctets, verifierSignature } from './mayem-core.js';

const CLES = /* CLES */[];

async function lire(source) {
  if (/^https:\/\//.test(source)) {
    const reponse = await fetch(source);
    if (!reponse.ok) throw new Error(`${source} : ${reponse.status}`);
    return new Uint8Array(await reponse.arrayBuffer());
  }
  if (/^[a-z]+:\/\//i.test(source)) throw new Error('Seules les adresses https:// ou les fichiers locaux sont acceptés.');
  return new Uint8Array(await readFile(source));
}

const voisin = (source, nom) => source.replace(/[^/\\]+$/, nom);
const texte = (octets) => new TextDecoder().decode(octets);

async function verifierScript(source, octets) {
  const fiche = JSON.parse(texte(await lire(voisin(source, 'signature.json'))));
  const raison = await verifierOctets(octets, fiche.signature, CLES);
  if (raison) return { raison };
  const hash = 'sha384-' + Buffer.from(await crypto.subtle.digest('SHA-384', octets)).toString('base64');
  if (hash !== fiche.integrite) return { raison: 'intégrité différente de celle qui est signée' };
  return { resume: `script ${fiche.version}, intégrité ${hash} (à recopier dans l'attribut integrity), clé ${fiche.signature.cle}` };
}

async function verifierPackFichier(octets) {
  const pack = JSON.parse(texte(octets));
  const erreurs = await verifierSignature(pack, CLES);
  if (erreurs.length) return { raison: erreurs.join(' ; ') };
  return { resume: `pack ${pack.nom} (${pack.langue}) ${pack.version}, clé ${pack.signature.cle}` };
}

const [source, ...options] = process.argv.slice(2);
const sortie = options.includes('--sortie') ? options[options.indexOf('--sortie') + 1] : null;
if (!source) {
  console.error('Usage : node mayem-verifier.mjs <adresse https ou fichier> [--sortie fichier]');
  process.exit(2);
}
try {
  const octets = await lire(source);
  const { raison, resume } = /\.m?js$/.test(source) ? await verifierScript(source, octets) : await verifierPackFichier(octets);
  if (raison) {
    console.error(`Refusé : ${raison}. Rien n'est écrit.`);
    process.exit(1);
  }
  if (sortie) await writeFile(sortie, octets);
  console.log(`Vérifié : ${resume}${sortie ? ` -> ${sortie}` : ''}`);
} catch (erreur) {
  console.error(`Refusé : ${erreur.message}. Rien n'est écrit.`);
  process.exit(1);
}
