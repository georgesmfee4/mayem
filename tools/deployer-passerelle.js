// Met la couche intermédiaire de Mayem en ligne sur Cloudflare (hebergement/passerelle/), à une adresse fixe.
//   npm run deployer:passerelle [-- --profil profiles/x.json]
// Les données sont embarquées dans le Worker : pack public (aucun nom de traducteur, contrôlé avant l'envoi),
// modèles de réponse, vocabulaires, profil. La clé de l'équipe n'y est jamais : c'est un secret Cloudflare que
// l'équipe saisit elle-même (la commande est rappelée à la fin). Puis l'adresse publique est sondée, sans appeler
// la banque du service.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { WRANGLER, wrangler } from './cloudflare.js';
import { donneesDuContexte } from './conversation.js';
import { choisirLangue, dossier, racine } from './langues.js';
import { valeur } from './options.js';
import { nomsInternes, versPublic } from './public.js';

const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
export const CONFIG_PASSERELLE = racine + 'hebergement/passerelle/wrangler.json';
const DONNEES = racine + 'hebergement/passerelle/donnees.json';
const ADRESSE = racine + 'hebergement/passerelle/adresse.txt';

export async function donneesEnLigne(cheminProfil) {
  const profil = lireJson(racine + cheminProfil);
  const code = choisirLangue(profil.langue !== 'fr' ? profil.langue : undefined);
  const interne = lireJson(dossier(code) + 'pack.json');
  const pack = await versPublic(interne);
  const donnees = { contexte: donneesDuContexte(code, { pack }), profil, langues: [{ code: 'fr', nom: 'Français' }, { code, nom: pack.nom }] };
  // Aucun nom de traducteur ne part, ni dans le pack ni ailleurs dans les données
  const brut = JSON.stringify(donnees);
  const presents = nomsInternes(interne).filter((nom) => nom.length > 2 && brut.includes(nom));
  if (presents.length) throw new Error(`${presents.length} nom(s) de traducteur dans les données : envoi refusé`);
  return donnees;
}

async function sonder(adresse) {
  const sante = await (await fetch(`${adresse}/sante`)).json();
  console.log(`Santé : ${sante.mode}, pack ${sante.pack}, profil « ${sante.profil} »`);
  // Un tour sans numéro : la couche doit répondre au contrat sans appeler la banque
  const tour = await (await fetch(`${adresse}/v1/middleware`, { method: 'POST', body: '{}' })).json();
  if (typeof tour.response?.text !== 'string' || !tour.interpretation?.intent) throw new Error('réponse hors contrat');
  console.log(`Tour d'essai : ${tour.interpretation.intent}, « ${tour.response.text} »`);
}

async function deployer() {
  const args = process.argv.slice(2);
  const cheminProfil = valeur(args, 'profil') || 'profiles/safinum.json';
  const donnees = await donneesEnLigne(cheminProfil);
  writeFileSync(DONNEES, JSON.stringify(donnees));
  const envoi = wrangler(['deploy'], { config: CONFIG_PASSERELLE });
  if (envoi.status !== 0) process.exit(envoi.status || 1);
  const adresse = (envoi.stdout.match(/https:\/\/[\w.-]+\.workers\.dev/) || [])[0];
  if (!adresse) throw new Error('adresse publique introuvable dans la sortie de wrangler');
  writeFileSync(ADRESSE, `${adresse}\n`);
  await sonder(adresse);
  const variable = donnees.profil.middleware.cle_env;
  console.log(`\nAdresse à déclarer : ${adresse}/v1/middleware`);
  console.log(`Clé de l'équipe, une fois, saisie par l'équipe : npx ${WRANGLER} secret put ${variable} --config hebergement/passerelle/wrangler.json`);
  console.log(`Puis, avec la clé dans la variable ${variable} : npm run declarer`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await deployer();
