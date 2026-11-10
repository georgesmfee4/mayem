// Prépare l'API de distribution des données dans api/ : de simples fichiers, servis tels quels par un
// hébergement statique. Elle diffuse les packs et leurs exports ; la traduction reste sur l'appareil.
// Usage : npm run api   ->   api/index.json, api/packs/<langue>/latest.json et <version>.json, api/exports/<langue>/
// Données de l'équipe Mayem, tous droits réservés : seules des versions publiques sortent (tools/public.js),
// sans aucun nom de traducteur. Rien n'est mis en ligne ici.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dossier, langues, racine } from './langues.js';
import { ecrireExports } from './export.js';
import { mentionDroits, validees } from './exports/commun.js';
import { versPublic } from './public.js';

const sortie = racine + 'api/';
const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const ecrireJson = (chemin, objet) => writeFileSync(chemin, JSON.stringify(objet, null, 2) + '\n');

async function publierLangue(langue) {
  const pack = await versPublic(lireJson(dossier(langue) + 'pack.json'));
  const ici = `${sortie}packs/${langue}/`;
  mkdirSync(ici, { recursive: true });
  ecrireJson(ici + 'latest.json', pack);
  // Les versions archivées gardent les noms en interne : chacune est publiée en version publique
  const archives = existsSync(dossier(langue) + 'versions') ? readdirSync(dossier(langue) + 'versions') : [];
  for (const nom of archives) ecrireJson(ici + nom, await versPublic(lireJson(`${dossier(langue)}versions/${nom}`)));
  const exports = ecrireExports(pack, `${sortie}exports/${langue}/`).map((chemin) => `exports/${langue}/${chemin}`);
  return {
    langue, nom: pack.nom, version: pack.version, date: pack.date, empreinte: pack.empreinte,
    producteur: pack.producteur, droits: mentionDroits(pack),
    phrases_validees: validees(pack).length, termes: pack.glossaire.filter((t) => t.bulu).length,
    pack: `packs/${langue}/latest.json`,
    versions: archives.map((nom) => nom.replace(/\.json$/, '')),
    exports,
  };
}

function page(sommaire) {
  const lignes = sommaire.langues.map((l) => `<li><strong>${l.nom}</strong> (${l.langue}) ${l.version}, ${l.phrases_validees} phrases validées.
    <a href="${l.pack}">pack</a> · ${l.exports.map((e) => `<a href="${e}">${e.split('/').slice(2).join('/')}</a>`).join(' · ')}</li>`);
  return `<!doctype html>\n<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Mayem, données linguistiques</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem">
<h1>Mayem : données linguistiques validées</h1>
<p>Phrases de services financiers, chacune validée par deux relecteurs de l'équipe Mayem. Point d'entrée :
<a href="index.json">index.json</a> (schéma : <a href="schema.json">schema.json</a>). Chaque pack porte une version
et une empreinte SHA-256.</p>
<p><strong>${sommaire.droits}</strong></p>
<ul>\n${lignes.join('\n')}\n</ul>\n</body></html>\n`;
}

rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
const publiees = [];
for (const langue of langues()) publiees.push(await publierLangue(langue));
const sommaire = {
  format: 1, producteur: 'Équipe Mayem',
  droits: 'Données de l\'équipe Mayem, tous droits réservés. Utilisation selon les conditions de l\'API Mayem (docs/API.md).',
  schema: 'schema.json', langues: publiees,
};
cpSync(racine + 'packs/schema.json', sortie + 'schema.json');
ecrireJson(sortie + 'index.json', sommaire);
writeFileSync(sortie + 'index.html', page(sommaire));
console.log(`API prête dans api/ : ${publiees.map((l) => `${l.langue} ${l.version}`).join(', ')}. Aucun nom de traducteur. Rien n'est en ligne.`);
