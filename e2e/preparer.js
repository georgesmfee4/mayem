// Construit l'extension, puis deux copies pour les tests (le vrai manifeste n'est pas touché) :
// - avec l'accès à 127.0.0.1, car sans clic réel sur l'icône activeTab ne donne rien ;
// - la même avec un pack modifié à la main, qui doit être refusé.
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
export const DOSSIER = join(tmpdir(), 'mayem-essai');

function copier(nom, changerPack) {
  const dossier = join(DOSSIER, nom);
  cpSync(racine + 'dist', dossier, { recursive: true });
  const manifeste = JSON.parse(readFileSync(join(dossier, 'manifest.json'), 'utf8'));
  manifeste.host_permissions = ['http://127.0.0.1/*'];
  writeFileSync(join(dossier, 'manifest.json'), JSON.stringify(manifeste, null, 2));
  if (changerPack) {
    const chemin = join(dossier, 'packs/bum/pack.json');
    const pack = JSON.parse(readFileSync(chemin, 'utf8'));
    changerPack(pack);
    writeFileSync(chemin, JSON.stringify(pack));
  }
}

export default function preparer() {
  const construction = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'tools/compile.js'], { cwd: racine, encoding: 'utf8' });
  if (construction.status !== 0) throw new Error(construction.stderr);
  rmSync(DOSSIER, { recursive: true, force: true });
  copier('bonne');
  // Un chiffre ajouté au bulu de X08 (« Votre solde est de {amount} »)
  copier('pack-modifie', (pack) => (pack.phrases.find((p) => p.id === 'X08').bulu += ' 500'));
}
