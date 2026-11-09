// Protection des informations financières : repérer les « faits » (montants, dates,
// numéros, références) et vérifier qu'une sortie garde exactement les mêmes chiffres.
// Uniquement des formes génériques, aucune règle propre à un service.

const DEVISE = String.raw`(?:FCFA|F\s?CFA|XAF|XOF|F(?!\p{L}))`;

export const MOTIFS = {
  // 25 000 FCFA · -12 500 FCFA · 2,500 FCFA · FCFA 25 000
  montant: String.raw`(?:[+\-−]?\d[\d\s.,]*\s?${DEVISE}|${DEVISE}\s?\d[\d\s.,]*\d)`,
  pourcentage: String.raw`\d+(?:[.,]\d+)?\s?%`,
  date: String.raw`(?:\d{1,2}(?:er)?\s+(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)\p{L}*\.?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\p{L}*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})`,
  // CM 001 2345 6789 01
  compte: String.raw`[A-Z]{2}\d{0,2}(?:\s?\d{2,4}){3,}`,
  // ABC-2026-K3P9QZ · SECURITY_002 · TX-482913
  reference: String.raw`(?=[A-Z0-9_\-]*\d)[A-Z][A-Z0-9]*(?:[\-_][A-Z0-9]+)+`,
  telephone: String.raw`\+?\d[\d\s.\-]{6,}\d`,
  code: String.raw`\d{4,8}`,
};

const FAITS = new RegExp(
  [MOTIFS.montant, MOTIFS.date, MOTIFS.compte, MOTIFS.reference, MOTIFS.telephone, MOTIFS.pourcentage]
    .map((s) => `(?:${s})`)
    .join('|'),
  'gu',
);

export const retirerFaits = (texte: string): string => texte.replace(FAITS, ' ');

// Rien à traduire : il ne reste aucune lettre une fois les faits retirés
export const queDesFaits = (texte: string): boolean => !/\p{L}/u.test(retirerFaits(texte));

// Texte « phrase » : au moins un mot qui commence par une minuscule. Exclut noms propres,
// marques et codes : « Jean-Paul Mbarga », « Mobile Money », « EN ».
export const estPhrase = (texte: string): boolean => /(?<!\p{L})\p{Ll}{3,}/u.test(retirerFaits(texte));

// Empreinte financière : suites de chiffres triées + nombre de mentions de devise
function empreinte(texte: string) {
  return {
    chiffres: (texte.match(/\d+/g) || []).sort().join('|'),
    devises: (texte.match(/FCFA|F\s?CFA|XAF|XOF/gi) || []).length,
  };
}

// Vrai seulement si la sortie a exactement les mêmes chiffres et devises que l'entrée
export function memesChiffres(entree: string, sortie: string): boolean {
  const a = empreinte(entree);
  const b = empreinte(sortie);
  return a.chiffres === b.chiffres && a.devises === b.devises;
}
