// Déclare au bac à sable l'adresse de la couche intermédiaire, pour chaque canal servi, puis relit ce qui est
// enregistré. À refaire si l'adresse change, et avant le gel de la configuration pendant l'évaluation.
//   npm run declarer                                  adresse en ligne (hebergement/passerelle/adresse.txt)
//   npm run declarer -- --adresse https://…/v1/middleware [--profil profiles/x.json] [--lire]
// La clé de l'équipe vient de la variable d'environnement nommée par le profil : jamais d'un fichier, jamais affichée.

import { existsSync, readFileSync } from 'node:fs';
import { racine } from './langues.js';
import { option, valeur } from './options.js';

const args = process.argv.slice(2);
const profil = JSON.parse(readFileSync(racine + (valeur(args, 'profil') || 'profiles/safinum.json'), 'utf8')).middleware;
const cle = process.env[profil.cle_env] || '';
if (!cle) {
  console.error(`Clé absente : définir la variable ${profil.cle_env} dans ce terminal, puis relancer.`);
  process.exit(1);
}
const enLigne = racine + 'hebergement/passerelle/adresse.txt';
const adresse = valeur(args, 'adresse') || (existsSync(enLigne) ? `${readFileSync(enLigne, 'utf8').trim()}/v1/middleware` : '');
const { base, entetes } = profil.banque;
const { chemin, canaux } = profil.declaration;
const masquer = (texte) => texte.split(cle).join('***');

async function appeler(methode, corps) {
  const reponse = await fetch(`${base}/${chemin}`, {
    method: methode,
    headers: { [entetes.cle]: cle, accept: 'application/json', ...(corps ? { 'content-type': 'application/json' } : {}) },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  return `HTTP ${reponse.status} ${masquer(await reponse.text()).slice(0, 300)}`;
}

if (!option(args, 'lire')) {
  if (!/^https:\/\//.test(adresse)) {
    console.error('Adresse publique en https attendue (--adresse, ou npm run deployer:passerelle avant).');
    process.exit(1);
  }
  for (const canal of canaux) console.log(`${canal} -> ${adresse} : ${await appeler('POST', { channel: canal, url: adresse })}`);
}
console.log(`Enregistré : ${await appeler('GET')}`);
