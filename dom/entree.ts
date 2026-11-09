// Point d'entrée chargé par le manifeste. Un content script ne peut pas être un module :
// celui-ci importe donc le reste du code et lit le pack depuis les fichiers de l'extension
// (adresse chrome-extension://, aucune requête vers Internet).

// À mettre à false pour la démo finale : seules les traductions validées s'affichent alors
const MODE_TEST = true;
const PACK = 'packs/bum/pack.json';

declare const chrome: { runtime: { getURL(chemin: string): string } };

(async () => {
  // Le script peut être injecté deux fois dans le même cadre : on ne démarre qu'une fois
  const global = globalThis as { mayemDemarre?: boolean };
  if (global.mayemDemarre) return;
  global.mayemDemarre = true;

  const adresse = (chemin: string) => chrome.runtime.getURL(chemin);
  const [{ demarrer }, pack] = await Promise.all([
    import(adresse('dom/page.js')),
    fetch(adresse(PACK)).then((reponse) => reponse.json()),
  ]);
  demarrer(pack, { test: MODE_TEST });
})();
