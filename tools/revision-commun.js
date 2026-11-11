// Outils partagés par les contrôles de révision (tools/revision.js, tools/revision-forme.js)

export const BLOQUANT = 'bloquant';
export const A_REVOIR = 'à revoir';

export const cle = (s) => (s || '').normalize('NFC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
export const motsDe = (s) => cle(s).split(/[^\p{L}\p{N}']+/u).filter(Boolean);

// Suite de mots entiers : « ôsu » ne correspond pas à « Ôsusua »
export function contientMots(texte, terme) {
  const a = motsDe(texte);
  const b = motsDe(terme);
  return b.length > 0 && a.some((_, i) => b.every((mot, k) => a[i + k] === mot));
}

export const constat = (refs, code, niveau, explication, question) =>
  ({ refs, ref: refs.join('+'), code, niveau, explication, question });
