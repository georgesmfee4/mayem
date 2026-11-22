// Nombres dits en lettres (« deux mille cinq cents ») : la valeur et la place qu'ils occupent dans le texte.
// Le texte reçu est déjà en minuscules et sans accents (core/comprendre.ts). Les mots des nombres sont des
// données passées par l'appelant : le français ici, d'autres langues quand leurs locuteurs les auront validés.

export interface MotsNombres {
  unites: Record<string, number>;
  // Multiplicateurs : cent, mille, million
  facteurs: Record<string, number>;
  // Mots qui relient sans compter (« et » dans « vingt et un »)
  liens: string[];
  // Deux mots qui n'en font qu'un (« quatre vingt » : 80, et non 4 + 20)
  composes: Record<string, number>;
}

export interface NombreTrouve { valeur: number; debut: number; fin: number }

export const MOTS_FRANCAIS: MotsNombres = {
  unites: {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30,
    quarante: 40, cinquante: 50, soixante: 60,
  },
  facteurs: { cent: 100, cents: 100, mille: 1000, million: 1e6, millions: 1e6 },
  liens: ['et'],
  composes: { 'quatre vingt': 80, 'quatre vingts': 80 },
};

interface Mot { mot: string; debut: number; fin: number }

const mots = (texte: string): Mot[] => [...texte.matchAll(/[a-z]+/g)].map((m) => ({ mot: m[0], debut: m.index!, fin: m.index! + m[0].length }));

// Les mots composés deviennent un seul mot, qui garde la place des deux
function regrouper(liste: Mot[], dico: MotsNombres): Mot[] {
  const sortie: Mot[] = [];
  for (const m of liste) {
    const avant = sortie[sortie.length - 1];
    const paire = avant ? `${avant.mot} ${m.mot}` : '';
    if (avant && paire in dico.composes) sortie[sortie.length - 1] = { mot: paire, debut: avant.debut, fin: m.fin };
    else sortie.push(m);
  }
  return sortie;
}

function valeur(liste: Mot[], dico: MotsNombres): number {
  let total = 0;
  let courant = 0;
  for (const { mot } of liste) {
    if (mot in dico.composes) courant += dico.composes[mot];
    else if (mot in dico.unites) courant += dico.unites[mot];
    else if (dico.facteurs[mot] === 100) courant = (courant || 1) * 100;
    else if (mot in dico.facteurs) { total += (courant || 1) * dico.facteurs[mot]; courant = 0; }
  }
  return total + courant;
}

const estNombre = (mot: string, dico: MotsNombres) => mot in dico.unites || mot in dico.facteurs || mot in dico.composes;

// Suites de mots-nombres séparés seulement par des espaces ou des traits d'union.
// « un » ou « une » seuls ne sont pas des nombres : « un ami », « une facture ».
export function nombresEnLettres(texte: string, dico: MotsNombres = MOTS_FRANCAIS): NombreTrouve[] {
  const trouves: NombreTrouve[] = [];
  let suite: Mot[] = [];
  const clore = () => {
    while (suite.length && dico.liens.includes(suite[suite.length - 1].mot)) suite.pop();
    const utiles = suite.filter((m) => !dico.liens.includes(m.mot));
    if (utiles.length && !(utiles.length === 1 && dico.unites[utiles[0].mot] === 1)) {
      trouves.push({ valeur: valeur(utiles, dico), debut: suite[0].debut, fin: suite[suite.length - 1].fin });
    }
    suite = [];
  };
  for (const m of regrouper(mots(texte), dico)) {
    const colle = suite.length > 0 && /^[\s-]*$/.test(texte.slice(suite[suite.length - 1].fin, m.debut));
    if (estNombre(m.mot, dico) || (colle && dico.liens.includes(m.mot))) {
      if (!colle) clore();
      suite.push(m);
    } else clore();
  }
  clore();
  return trouves;
}
