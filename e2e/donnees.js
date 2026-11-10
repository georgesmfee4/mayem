// Bulu attendu, lu dans le pack : les tests suivent les corrections des locuteurs
import { readFileSync } from 'node:fs';

const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));

export const bulu = (id, valeurs = {}) =>
  pack.phrases.find((p) => p.id === id).bulu.replace(/\{(\w+)\}/g, (_, nom) => valeurs[nom]);

// Tous les nombres visibles, dans l'ordre, y compris dans les Shadow DOM ouverts et les cadres
export async function nombres(page) {
  const parCadre = await Promise.all(page.frames().map((cadre) => cadre.evaluate(() => {
    const textes = [];
    const lire = (racine) => {
      const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) textes.push(n.nodeValue);
        else if (n.shadowRoot && n.id !== 'mayem-host') lire(n.shadowRoot);
      }
    };
    lire(document.body);
    return textes.join(' ').match(/\d+/g) || [];
  })));
  return parCadre.flat();
}
