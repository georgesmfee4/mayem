// Prépare l'API de distribution des données dans api/ : de simples fichiers, servis tels quels par
// n'importe quel hébergement statique gratuit (GitHub Pages…). Elle diffuse les packs et leurs exports ;
// la traduction, elle, reste sur l'appareil de chaque utilisateur.
// Usage : npm run api   ->   api/index.json, api/packs/<langue>/latest.json et <version>.json, api/exports/<langue>/
// Rien n'est mis en ligne ici : publier reste une décision humaine (accords des locuteurs).

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dossier, langues, racine } from './langues.js';
import { ecrireExports } from './export.js';
import { validees } from './exports/commun.js';

const sortie = racine + 'api/';
const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const cle = (nom) => nom.trim().toLowerCase();

// Les colonnes « traduit par » contiennent parfois plusieurs personnes : « Alexandre et Ronald »
export function contributeurs(pack) {
  const noms = new Map();
  const personnes = [...pack.phrases, ...pack.glossaire].flatMap((e) => [e.traduit_par, e.relu_par, e.retraduit_par]);
  for (const champ of personnes) {
    for (const nom of (champ || '').split(/\s*(?:,|\/|&|\bet\b)\s*/i).filter((n) => n.trim())) {
      // « lesly » puis « Lesly » : on garde la forme avec majuscule
      const deja = noms.get(cle(nom));
      if (!deja || deja === deja.toLowerCase()) noms.set(cle(nom), nom.trim());
    }
  }
  return [...noms.values()];
}

// packs/<langue>/accords.json : noms des personnes qui ont signé docs/accord-locuteurs.md
function licence(langue, pack) {
  const fichier = dossier(langue) + 'accords.json';
  const signes = new Set((existsSync(fichier) ? lireJson(fichier) : []).map(cle));
  const manquants = contributeurs(pack).filter((nom) => !signes.has(cle(nom)));
  return { licence: manquants.length ? 'réservée : accords des locuteurs en attente' : 'CC-BY-4.0', manquants };
}

function publierLangue(langue) {
  const pack = lireJson(dossier(langue) + 'pack.json');
  const ici = `${sortie}packs/${langue}/`;
  mkdirSync(ici, { recursive: true });
  cpSync(dossier(langue) + 'pack.json', ici + 'latest.json');
  const archives = existsSync(dossier(langue) + 'versions') ? readdirSync(dossier(langue) + 'versions') : [];
  for (const nom of archives) cpSync(`${dossier(langue)}versions/${nom}`, ici + nom);
  const exports = ecrireExports(pack, `${sortie}exports/${langue}/`).map((chemin) => `exports/${langue}/${chemin}`);
  const { licence: etat, manquants } = licence(langue, pack);
  if (manquants.length) console.log(`${langue} : accord à signer par ${manquants.join(', ')} (docs/accord-locuteurs.md)`);
  return {
    langue, nom: pack.nom, version: pack.version, date: pack.date, empreinte: pack.empreinte, licence: etat,
    phrases_validees: validees(pack).length, termes: pack.glossaire.filter((t) => t.bulu).length,
    pack: `packs/${langue}/latest.json`,
    versions: archives.map((nom) => nom.replace(/\.json$/, '')),
    exports,
    contributeurs: contributeurs(pack),
  };
}

function page(sommaire) {
  const lignes = sommaire.langues.map((l) => `<li><strong>${l.nom}</strong> (${l.langue}) ${l.version}, ${l.phrases_validees} phrases validées, licence : ${l.licence}.
    <a href="${l.pack}">pack</a> · ${l.exports.map((e) => `<a href="${e}">${e.split('/').slice(2).join('/')}</a>`).join(' · ')}</li>`);
  return `<!doctype html>\n<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Mayem, données linguistiques</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem">
<h1>Mayem : données linguistiques validées</h1>
<p>Phrases de services financiers traduites et relues par deux locuteurs. Point d'entrée : <a href="index.json">index.json</a>
(schéma : <a href="schema.json">schema.json</a>). Chaque pack porte une version et une empreinte SHA-256.</p>
<ul>\n${lignes.join('\n')}\n</ul>\n</body></html>\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(sortie, { recursive: true });
  const sommaire = { format: 1, schema: 'schema.json', langues: langues().map(publierLangue) };
  cpSync(racine + 'packs/schema.json', sortie + 'schema.json');
  writeFileSync(sortie + 'index.json', JSON.stringify(sommaire, null, 2) + '\n');
  writeFileSync(sortie + 'index.html', page(sommaire));
  console.log(`API prête dans api/ : ${sommaire.langues.map((l) => `${l.langue} ${l.version}`).join(', ')}. Rien n'est en ligne.`);
}
