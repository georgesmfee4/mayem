// Importe un tableur rempli par les locuteurs, puis reconstruit le pack.
// Usage : npm run import -- chemin/vers/fichier.xlsx [langue]
// kit.py reporte les traductions dans packs/<langue>/corpus.csv et glossaire.csv ; build-pack contrôle tout
// et n'écrit le pack que s'il est bon.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { choisirLangue, dossier } from './langues.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
// build-pack lit core/verifier.ts : Node doit retirer les types
const NODE_TS = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
const [fichier, langue] = process.argv.slice(2);

if (!fichier || !existsSync(fichier)) {
  console.error(fichier ? `Fichier introuvable : ${fichier}` : 'Usage : npm run import -- fichier.xlsx');
  process.exit(1);
}

// « python » sous Windows (où « python3 » peut être un raccourci vers le Store), « python3 » ailleurs
function lancerPython(args) {
  const commandes = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  for (const commande of commandes) {
    const r = spawnSync(commande, args, { cwd: racine, stdio: 'inherit' });
    if (!r.error) return r.status;
  }
  console.error('Python est introuvable. Installer Python 3, puis : python -m pip install openpyxl');
  return 1;
}

const statut = lancerPython([racine + 'tools/kit.py', 'import', fichier, ...(langue ? ['--langue', langue] : [])]);
if (statut !== 0) process.exit(statut);

const node = (outil) => spawnSync(process.execPath, [...NODE_TS, racine + outil, ...(langue ? [langue] : [])], { stdio: 'inherit' }).status ?? 1;

// Tableur de révision : ses réponses sont appliquées avant de reconstruire le pack, puis on montre ce qui reste
const revision = existsSync(dossier(choisirLangue(langue)) + 'reponses-revision.json');
if (revision && node('tools/appliquer-revision.js') !== 0) process.exit(1);
const pack = node('tools/build-pack.js');
if (pack === 0 && revision) node('tools/rapport-revision.js');
process.exit(pack);
