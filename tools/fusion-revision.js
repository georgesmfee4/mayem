// Applique les réponses du tableur de révision (extraites par tools/kit.py import) sans rien perdre :
// - rien de changé : la validation actuelle reste ; « garder » signé par deux personnes est noté (decisions.csv) ;
// - bulu changé et signé par deux personnes différentes : remplacé et validé ;
// - bulu changé avec un seul nom : l'ancien bulu validé reste affiché, la proposition attend (en-attente.csv) ;
// - une consigne (« … pour dire … »), un chiffre ou un champ {…} changé, deux propositions différentes : refusé.
// Le glossaire suit la règle habituelle : une case vide n'efface jamais un terme déjà traduit.

const net = (s) => (s || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const nom = (s) => net(s).toLowerCase();
const deuxPersonnes = (a, b) => nom(a) !== '' && nom(b) !== '' && nom(a) !== nom(b);
const mots = (s) => net(s).split(' ').filter(Boolean).length;
const champs = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
const chiffres = (s) => (s.match(/\d+/g) || []).sort().join();

// Une explication plutôt qu'une traduction : « nkúán pour dire erreur », « Zéro = momo », un mot seul pour une phrase
export function ressembleAUneConsigne(nouveau, ancien) {
  return /pour dire|se dit|veut dire|traduction de|=/i.test(nouveau) || (mots(ancien) >= 4 && mots(nouveau) < mots(ancien) / 2);
}

function refusDe(r, ligne) {
  if (ressembleAUneConsigne(r.bulu, ligne.bulu)) return 'ressemble à une explication, pas à une phrase complète';
  if (champs(r.bulu) !== champs(ligne.fr)) return 'les mots entre accolades {…} diffèrent du français';
  if (chiffres(r.bulu) !== chiffres(ligne.fr)) return 'les chiffres diffèrent du français';
  return '';
}

function fusionnerPhrases(corpus, reponses, date, rapport) {
  const parId = new Map(corpus.map((l) => [l.id, l]));
  const propositions = new Map();
  for (const r of reponses.filter((x) => parId.has(x.ref) && net(x.bulu) && net(x.bulu) !== net(parId.get(x.ref).bulu))) {
    propositions.set(r.ref, [...(propositions.get(r.ref) || []), net(r.bulu)]);
  }
  for (const r of reponses) {
    const ligne = parId.get(r.ref);
    if (!ligne) continue;
    if (net(r.commentaire)) rapport.commentaires.push({ ref: r.ref, date, traduit_par: net(r.traduit_par), relu_par: net(r.relu_par), commentaire: net(r.commentaire) });
    if (!net(r.bulu) || net(r.bulu) === net(ligne.bulu)) {
      if (deuxPersonnes(r.traduit_par, r.relu_par) && (nom(r.decision) === 'garder' || nom(r.different) === 'non')) {
        for (const code of r.codes) rapport.decisions.push({ code, ref: r.ref, bulu: ligne.bulu, decide_par: net(r.traduit_par), relu_par: net(r.relu_par), date, commentaire: net(r.commentaire) });
      }
      continue;
    }
    const refus = new Set(propositions.get(r.ref)).size > 1 ? 'deux propositions différentes pour la même phrase' : refusDe(r, ligne);
    if (refus) { rapport.refus.push(`${r.ref} : « ${net(r.bulu)} » (${refus})`); continue; }
    if (!deuxPersonnes(r.traduit_par, r.relu_par)) {
      rapport.attente.push({ ref: r.ref, ancien: ligne.bulu, nouveau: net(r.bulu), traduit_par: net(r.traduit_par), relu_par: net(r.relu_par), date });
      continue;
    }
    rapport.changements.push(`${r.ref} : « ${ligne.bulu} » -> « ${net(r.bulu)} »`);
    Object.assign(ligne, { bulu: net(r.bulu), valide_par: `${net(r.traduit_par)} / relu par ${net(r.relu_par)}`, valide: '1' });
  }
}

// colonnes : { ref, bulu, traduit, relu } -> en-têtes réels de glossaire.csv
function fusionnerGlossaire(glossaire, colonnes, reponses, date, rapport) {
  const parRef = new Map(glossaire.map((l) => [net(l[colonnes.ref]), l]));
  for (const r of reponses) {
    const ligne = parRef.get(r.ref);
    if (!ligne) continue;
    if (net(r.commentaire)) rapport.commentaires.push({ ref: r.ref, date, traduit_par: net(r.choisi_par), relu_par: net(r.relu_par), commentaire: net(r.commentaire) });
    const nouveau = net(r.bulu);
    if (!nouveau || nouveau === net(ligne[colonnes.bulu])) continue;
    if (/pour dire|se dit|veut dire|=/i.test(nouveau)) { rapport.refus.push(`${r.ref} : « ${nouveau} » (ressemble à une explication)`); continue; }
    if (!deuxPersonnes(r.choisi_par, r.relu_par)) {
      rapport.attente.push({ ref: r.ref, ancien: ligne[colonnes.bulu], nouveau, traduit_par: net(r.choisi_par), relu_par: net(r.relu_par), date });
      continue;
    }
    rapport.changements.push(`${r.ref} : « ${ligne[colonnes.bulu]} » -> « ${nouveau} »`);
    Object.assign(ligne, { [colonnes.bulu]: nouveau, [colonnes.traduit]: net(r.choisi_par), [colonnes.relu]: net(r.relu_par) });
  }
}

// style.csv : une réponse vide n'efface jamais la réponse existante
function fusionnerCharte(style, colonneReponse, reponses, date, rapport) {
  for (const r of reponses) {
    if (net(r.commentaire)) rapport.commentaires.push({ ref: `charte : ${r.sujet}`, date, traduit_par: '', relu_par: '', commentaire: net(r.commentaire) });
    if (!net(r.reponse)) continue;
    const ligne = style.find((l) => l.Sujet === r.sujet);
    if (ligne) ligne[colonneReponse] = net(r.reponse);
    else style.push({ Sujet: r.sujet, Question: r.question, [colonneReponse]: net(r.reponse) });
    rapport.charte.push(`${r.sujet} : ${net(r.reponse)}`);
  }
}

export function fusionner({ corpus, glossaire, colonnesGlossaire, style, colonneReponse }, reponses, date) {
  const rapport = { changements: [], attente: [], refus: [], decisions: [], commentaires: [], charte: [] };
  fusionnerPhrases(corpus, reponses.phrases || [], date, rapport);
  fusionnerGlossaire(glossaire, colonnesGlossaire, reponses.glossaire || [], date, rapport);
  fusionnerCharte(style, colonneReponse, reponses.charte || [], date, rapport);
  return rapport;
}
