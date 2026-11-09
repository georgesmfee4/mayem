// Protection des informations financières : repérage des « faits » (montants, dates,
// numéros, références) et contrôle qu'une sortie contient exactement les mêmes chiffres.
// Aucune règle propre à un service : uniquement des formes génériques.
(() => {
  const SAF = (globalThis.SAF = globalThis.SAF || {});

  const CUR = String.raw`(?:FCFA|F\s?CFA|XAF|XOF|F(?!\p{L}))`;
  const RE = (SAF.RE = {
    // 25 000 FCFA · -12 500 FCFA · 2,500 FCFA · FCFA 25 000
    amount: String.raw`(?:[+\-−]?\d[\d\s.,]*\s?${CUR}|${CUR}\s?\d[\d\s.,]*\d)`,
    percent: String.raw`\d+(?:[.,]\d+)?\s?%`,
    date: String.raw`(?:\d{1,2}(?:er)?\s+(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)\p{L}*\.?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\p{L}*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})`,
    // CM 001 2345 6789 01
    account: String.raw`[A-Z]{2}\d{0,2}(?:\s?\d{2,4}){3,}`,
    // SAF-2026-K3P9QZ · SECURITY_002 · TX-482913
    ref: String.raw`(?=[A-Z0-9_\-]*\d)[A-Z][A-Z0-9]*(?:[\-_][A-Z0-9]+)+`,
    phone: String.raw`\+?\d[\d\s.\-]{6,}\d`,
    code: String.raw`\d{4,8}`,
  });

  const FACTS = new RegExp(
    [RE.amount, RE.date, RE.account, RE.ref, RE.phone, RE.percent].map((s) => `(?:${s})`).join('|'),
    'gu',
  );
  SAF.stripFacts = (t) => t.replace(FACTS, ' ');

  // Rien à traduire : il ne reste aucune lettre une fois les faits retirés
  SAF.isFactOnly = (t) => !/\p{L}/u.test(SAF.stripFacts(t));

  // Texte « phrase » : au moins un mot qui commence par une minuscule (exclut noms propres,
  // marques, codes : « Jean-Paul Mbarga », « Safinum Pay », « EN »)
  SAF.isMeaningful = (t) => /(?<!\p{L})\p{Ll}{3,}/u.test(SAF.stripFacts(t));

  // Empreinte financière : suites de chiffres (triées) + nombre de mentions de devise
  SAF.fingerprint = (t) => ({
    nums: (t.match(/\d+/g) || []).sort().join('|'),
    cur: (t.match(/FCFA|F\s?CFA|XAF|XOF/gi) || []).length,
  });

  // Vrai seulement si la sortie contient exactement les mêmes chiffres et devises que l'entrée
  SAF.sameFinancialTokens = (a, b) => {
    const x = SAF.fingerprint(a);
    const y = SAF.fingerprint(b);
    return x.nums === y.nums && x.cur === y.cur;
  };
})();
