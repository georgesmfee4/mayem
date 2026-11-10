// Tableur de relecture : les points du contrôle (core/controle.ts) à faire trancher par les locuteurs.
// Usage : npm run relecture [-- <langue>]  ->  relecture-<langue>.xlsx (tools/kit.py relecture)
// Retour : npm run import -- relecture-<langue>.xlsx. « Corriger » remplace le bulu, « Garder » est noté
// dans packs/<langue>/decisions.csv et le point n'est plus redemandé.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { controler } from '../core/controle.ts';
import { ecrireCsv } from './csv.js';
import { lireDecisions, pointsOuverts, texteDe } from './decisions.js';
import { choisirLangue, dossier, racine } from './langues.js';

// Les négations touchent la sécurité : elles passent en premier
const ORDRE = { negation: 0, glossaire: 1, coherence: 2 };
const TYPES = { negation: 'Négation', glossaire: 'Terme du glossaire', coherence: 'Cohérence' };
export const COLONNES = ['numero', 'type', 'ref', 'fr', 'bulu', 'signale', 'attendu', 'critique', 'point', 'cle_type'];

function question(point, pack) {
  if (point.type === 'negation') {
    return `Le français contient une négation (« ${point.terme.fr} »). La forme du glossaire « ${point.terme.attendu} » n'apparaît pas dans le bulu. Le sens négatif est-il bien rendu ?`;
  }
  if (point.type === 'glossaire') {
    return `Le français contient « ${point.terme.fr} ». Le glossaire le traduit « ${point.terme.attendu} », absent du bulu. Faut-il l'utiliser, ou cette formulation est-elle voulue ?`;
  }
  const textes = point.ids.map((ref) => texteDe(pack, ref));
  const memeBulu = new Set(textes.map((t) => t.bulu.trim().toLowerCase())).size === 1;
  return memeBulu
    ? `Le même bulu « ${textes[0].bulu} » sert pour : ${textes.map((t, i) => `${point.ids[i]} « ${t.fr} »`).join(', ')}. Faut-il les distinguer ?`
    : `Le même français est traduit de plusieurs façons : ${textes.map((t, i) => `${point.ids[i]} « ${t.bulu} »`).join(', ')}. Faut-il n'en garder qu'une ?`;
}

// Une ligne par phrase concernée ; les lignes d'un même point portent le même numéro
export function lignesRelecture(pack, decisions = []) {
  const points = pointsOuverts(controler(pack), decisions, pack).sort((a, b) => ORDRE[a.type] - ORDRE[b.type]);
  return points.flatMap((point, i) => point.ids.map((ref) => {
    const texte = texteDe(pack, ref);
    return {
      numero: i + 1, type: TYPES[point.type], ref, fr: texte.fr, bulu: texte.bulu,
      signale: question(point, pack), attendu: point.terme?.attendu || '', critique: texte.critique ? '1' : '0',
      point: point.ids.join('+'), cle_type: point.type,
    };
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const langue = choisirLangue(process.argv[2]);
  const ici = dossier(langue);
  const pack = JSON.parse(readFileSync(ici + 'pack.json', 'utf8'));
  const lignes = lignesRelecture(pack, lireDecisions(ici + 'decisions.csv'));
  if (!lignes.length) {
    console.log('Aucun point à relire.');
    process.exit(0);
  }
  writeFileSync(ici + 'relecture.csv', ecrireCsv(COLONNES, lignes));
  const commandes = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  const args = [racine + 'tools/kit.py', 'relecture', ici + 'relecture.csv', '--langue', langue];
  // « python » sous Windows, « python3 » ailleurs : le premier qui existe
  for (const commande of commandes) {
    const lance = spawnSync(commande, args, { stdio: 'inherit' });
    if (!lance.error) process.exit(lance.status ?? 1);
  }
  console.error('Python est introuvable. Installer Python 3, puis : python -m pip install openpyxl');
  process.exit(1);
}
