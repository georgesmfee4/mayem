// Lance la passerelle Mayem sur ce poste (service/passerelle.ts), branchée sur le service décrit par un profil.
//
//   npm run passerelle                                  banque d'essai comprise : tout tourne sur ce poste
//   npm run passerelle -- --profil profiles/x.json      service réel ou bac à sable décrit par le profil
//   npm run passerelle -- --port 8787 --langue <code>
//
// Avec la banque d'essai, le même compte simulé sert l'USSD, l'application mobile et l'assistant : un transfert fait
// sur un canal se voit sur les autres. Pages : /tableau (journal en direct), /essai/telephone, /essai/application.

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { banqueSimulee } from '../service/banque.ts';
import { creerPasserelle } from '../service/passerelle.ts';
import { serviceBanque } from '../fixtures/services/banque.js';
import { chargerContexte } from './conversation.js';
import { lireCsv } from './csv.js';
import { choisirLangue, dossier, racine } from './langues.js';
import { valeur } from './options.js';

const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));

// « *126# puis 1 > {telephone} > {montant} » -> ['1', '{telephone}', '{montant}'] : les touches après le code du service
export function lireTouches(notation, code = '') {
  const apres = notation.split(/\bpuis\b/i).pop().replace(code, '');
  return apres.split('>').map((t) => t.trim()).filter((t) => t && !/^\*.*#$/.test(t));
}

// Touches relevées dans le dossier du profil (profiles/<service>/raccourcis.csv), ajoutées au profil
export function avecTouches(profil, cheminProfil) {
  const fichier = cheminProfil.replace(/\.json$/, '') + '/raccourcis.csv';
  if (!existsSync(fichier)) return profil;
  const releves = lireCsv(readFileSync(fichier, 'utf8')).filter((l) => l.touches && l.releve_par);
  const raccourcis = Object.fromEntries(releves.map((l) => [l.intention, lireTouches(l.touches, profil.ussd?.code)]));
  return { ...profil, ussd: { ...(profil.ussd || {}), raccourcis: { ...raccourcis, ...(profil.ussd?.raccourcis || {}) } } };
}

// Une requête Node devient une Request du web, et la Response revient en réponse Node
async function versRequest(entree, base) {
  const morceaux = [];
  for await (const morceau of entree) morceaux.push(morceau);
  const corps = ['GET', 'HEAD'].includes(entree.method) ? undefined : Buffer.concat(morceaux);
  return new Request(new URL(entree.url, base), { method: entree.method, headers: entree.headers, body: corps });
}

async function repondre(sortie, reponse) {
  sortie.writeHead(reponse.status, Object.fromEntries(reponse.headers));
  sortie.end(Buffer.from(await reponse.arrayBuffer()));
}

function servir(port, traiter) {
  const base = `http://127.0.0.1:${port}`;
  return new Promise((pret) => {
    const serveur = createServer(async (entree, sortie) => {
      try { await repondre(sortie, await traiter(await versRequest(entree, base))); }
      catch (e) { console.error(e); sortie.writeHead(500).end(); }
    });
    serveur.listen(port, '127.0.0.1', () => pret(serveur));
  });
}

const page = (chemin) => new Response(readFileSync(racine + chemin), { headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function lancer({ profil: cheminProfil, port = 8787, portEssai = 8788, langue } = {}) {
  const essai = !cheminProfil;
  const chemin = cheminProfil || racine + 'profiles/banque-essai.json';
  const profil = avecTouches(lireJson(chemin), chemin);
  const code = choisirLangue(langue || (profil.langue !== 'fr' ? profil.langue : undefined));
  if (langue) profil.langue = langue;
  const banque = banqueSimulee(lireJson(racine + 'service/banque-essai.json'));
  const ctx = chargerContexte(code, banque);
  const pack = lireJson(dossier(code) + 'pack.json');
  // La clé de l'équipe pour la banque du service : seulement dans l'environnement, jamais affichée ni écrite
  const cleBanque = profil.middleware ? process.env[profil.middleware.cle_env] || '' : '';
  if (profil.middleware && !cleBanque) console.log(`Clé de la banque absente : définir la variable ${profil.middleware.cle_env}`);
  const passerelle = creerPasserelle({ ctx, pack, profil, cleBanque, pages: { tableau: readFileSync(racine + 'service/tableau.html', 'utf8') } });
  const serveurs = [];
  if (essai) serveurs.push(await servir(portEssai, serviceBanque(banque).traiter));
  serveurs.push(await servir(port, (requete) => {
    const chemin = new URL(requete.url).pathname;
    if (chemin === '/essai/telephone') return page('fixtures/essai/telephone.html');
    if (chemin === '/essai/application') return page('fixtures/essai/application.html');
    return passerelle.traiter(requete);
  }));
  return { passerelle, fermer: () => serveurs.forEach((s) => s.close()) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const port = Number(valeur(args, 'port') || 8787);
  await lancer({ profil: valeur(args, 'profil'), port, langue: valeur(args, 'langue') });
  console.log(`Passerelle Mayem : http://127.0.0.1:${port}`);
  console.log(`  tableau de bord     http://127.0.0.1:${port}/tableau`);
  console.log(`  téléphone (USSD)    http://127.0.0.1:${port}/essai/telephone`);
  console.log(`  application mobile  http://127.0.0.1:${port}/essai/application`);
}
