// Ce que tous les exports partagent : seules les phrases validées par deux personnes sortent du projet.

export const validees = (pack) => pack.phrases.filter((phrase) => phrase.valide && phrase.cible);
export const termesTraduits = (pack) => pack.glossaire.filter((terme) => terme.cible);

export const echapperXml = (texte) =>
  String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Champs {nom} dans l'ordre où le français les cite
export const champs = (texte) => [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

export const entete = '<?xml version="1.0" encoding="UTF-8"?>\n';

// Mention portée par chaque export : les données appartiennent à l'équipe Mayem
export const mentionDroits = (pack) =>
  `© ${pack.producteur || 'Équipe Mayem'}. ${pack.droits || 'Tous droits réservés'}. Utilisation selon les conditions de l'API Mayem.`;
