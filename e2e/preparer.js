// Construit l'extension, puis deux copies pour les tests (le vrai manifeste n'est pas touché) :
// - avec l'accès à 127.0.0.1, car sans clic réel sur l'icône activeTab ne donne rien ;
// - la même avec un pack modifié à la main, qui doit être refusé ;
// - la même avec une deuxième langue d'essai, « zzz », pour le changement de langue ;
// - la version pseudo (npm run build:pseudo), pour les débordements ;
// - les copies de npm run demo:refus (mot changé : seule l'empreinte le voit).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
export const DOSSIER = join(tmpdir(), 'mayem-essai');

function copier(nom, changerPack, changerDossier, source = 'dist') {
  const dossier = join(DOSSIER, nom);
  cpSync(racine + source, dossier, { recursive: true });
  const manifeste = JSON.parse(readFileSync(join(dossier, 'manifest.json'), 'utf8'));
  manifeste.host_permissions = ['http://127.0.0.1/*'];
  writeFileSync(join(dossier, 'manifest.json'), JSON.stringify(manifeste, null, 2));
  if (changerPack) {
    const chemin = join(dossier, 'packs/bum/pack.json');
    const pack = JSON.parse(readFileSync(chemin, 'utf8'));
    changerPack(pack);
    writeFileSync(chemin, JSON.stringify(pack));
  }
  if (changerDossier) changerDossier(dossier);
}

// Même calcul que core/empreinte.ts
const empreinte = (pack) => 'sha256-' + createHash('sha256').update(JSON.stringify({ ...pack, empreinte: undefined })).digest('hex');

// Langue d'essai : « [zz] » devant le français garde les mêmes chiffres et les mêmes champs
function ajouterLangueEssai(dossier) {
  const pack = JSON.parse(readFileSync(join(dossier, 'packs/bum/pack.json'), 'utf8'));
  const essai = { ...pack, langue: 'zzz', nom: 'Essai', phrases: pack.phrases.map((p) => ({ ...p, bulu: `[zz] ${p.fr}` })) };
  essai.empreinte = empreinte(essai);
  mkdirSync(join(dossier, 'packs/zzz'), { recursive: true });
  writeFileSync(join(dossier, 'packs/zzz/pack.json'), JSON.stringify(essai));
  const sommaire = JSON.parse(readFileSync(join(dossier, 'packs/index.json'), 'utf8'));
  writeFileSync(join(dossier, 'packs/index.json'), JSON.stringify([...sommaire, { langue: 'zzz', nom: 'Essai', version: essai.version }]));
}

function construire(outil, ...options) {
  const construction = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', outil, ...options], { cwd: racine, encoding: 'utf8' });
  if (construction.status !== 0) throw new Error(construction.stderr);
}

export default function preparer() {
  construire('tools/compile.js', '--pseudo');
  construire('tools/demo-refus.js'); // reconstruit aussi dist/ et dist-web/
  rmSync(DOSSIER, { recursive: true, force: true });
  copier('bonne');
  // Un chiffre ajouté au bulu de X08 (« Votre solde est de {amount} »)
  copier('pack-modifie', (pack) => (pack.phrases.find((p) => p.id === 'X08').bulu += ' 500'));
  copier('deux-langues', null, ajouterLangueEssai);
  copier('pseudo', null, null, 'dist-pseudo');
  copier('mot-change', null, null, 'dist-refus/mot-change');
}
