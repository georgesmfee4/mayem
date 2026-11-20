// Niveau 3, sens reconnu : une phrase française nouvelle de même sens qu'une phrase validée reçoit sa
// traduction validée ; un seul trait de sens différent, et l'original reste.
// Les « [cible] … » des petits packs sont des marqueurs d'essai, pas des traductions ; sans chiffre,
// sinon le contrôle des chiffres les refuserait à juste titre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traduire } from '../core/moteur.ts';
import { AUTRE_PHRASE_JUSTE, HORS_PORTEE, PARAPHRASES, pieges } from './sens-donnees.js';

const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));
const phrase = (id, fr, variantes) => ({ id, fr, en: [], cible: `[cible] ${id}${fr.includes('{amount}') ? ' {amount}' : ''}`, critique: true, traduit_par: 'a', relu_par: 'b', retraduit_par: '', retraduction: '', valide: true, ...(variantes ? { variantes } : {}) });
const petit = (...phrases) => ({ format: 2, langue: 'qaa', nom: 'Essai', version: '0.1.0', etiquettes: {}, glossaire: [], phrases });
const reconnu = (texte, p = pack) => {
  const r = traduire(texte, p);
  return r?.sens === 'reconnu' && r.statut === 'ok' ? r.id : null;
};

test('jeu d\'essai : chaque paraphrase reçoit la traduction de sa phrase validée', () => {
  const manquees = PARAPHRASES.filter(([texte, id]) => traduire(texte, pack)?.id !== id || traduire(texte, pack)?.statut !== 'ok');
  assert.deepEqual(manquees, []);
});

test('jeu d\'essai : aucun piège ne reçoit de traduction (négation, temps, argent, personne, action, modalité)', () => {
  const liste = pieges(pack);
  assert.ok(liste.length >= 450, `${liste.length} pièges`);
  const faux = liste.filter(([texte]) => {
    const id = reconnu(texte);
    return id && AUTRE_PHRASE_JUSTE.get(texte) !== id;
  });
  assert.deepEqual(faux, []);
});

test('hors de portée : l\'original reste, jamais une autre traduction', () => {
  for (const [texte, id] of HORS_PORTEE) {
    const r = traduire(texte, pack);
    assert.ok(r?.statut !== 'ok' || r.id === id, texte);
  }
});

test('une phrase exacte du corpus passe avant le sens reconnu', () => {
  const r = traduire('Votre transfert a été envoyé avec succès.', pack);
  assert.equal(r.id, 'C02');
  assert.equal(r.sens, undefined);
  assert.equal(reconnu('Votre virement a bien été envoyé.'), 'C02');
});

test('garde-fous : un seul trait de sens différent et l\'original reste', () => {
  const p = petit(phrase('PA', 'Votre transfert a été envoyé.'), phrase('PB', "J'ai vérifié le numéro du bénéficiaire."), phrase('PC', 'Vous devez confirmer le transfert.'));
  assert.equal(reconnu('Votre virement a bien été envoyé.', p), 'PA');
  assert.equal(reconnu("Votre virement n'a pas été envoyé.", p), null, 'négation');
  assert.equal(reconnu('Votre virement sera envoyé.', p), null, 'temps');
  assert.equal(reconnu('Votre virement a été reçu.', p), null, "sens de l'argent");
  assert.equal(reconnu("J'ai bien vérifié le numéro du destinataire.", p), 'PB');
  assert.equal(reconnu('Vérifiez le numéro du destinataire.', p), null, 'personne');
  assert.equal(reconnu('Vous pouvez confirmer le virement.', p), null, 'modalité');
});

test('une négation de plus compte, même dans un texte qui en a déjà une', () => {
  const p = petit(phrase('PA', 'Vérifiez le numéro. Une opération confirmée ne peut pas être annulée.'));
  assert.equal(reconnu('Contrôlez le numéro. Une transaction confirmée ne peut pas être annulée.', p), 'PA');
  assert.equal(reconnu('Ne contrôlez pas le numéro. Une transaction confirmée ne peut pas être annulée.', p), null);
});

test('valeurs : reprises telles quelles, et abstention quand deux valeurs du même type peuvent s\'échanger', () => {
  const r = traduire('Votre code de confirmation est 4821. Ne le communiquez à personne.', pack);
  assert.equal(r.sens, 'reconnu');
  assert.match(r.sortie, /4821/);
  const p = petit(phrase('PA', 'Frais de {percent} (min. {amount_1}, max. {amount_2})'));
  assert.equal(reconnu('Commission de 2 % (min. 100 FCFA, max. 5 000 FCFA)', p), null);
});

test('imparfait : une échéance passée n\'est pas une échéance à venir', () => {
  const p = petit(phrase('PA', 'Votre échéance de {amount} est prévue demain.'));
  assert.equal(reconnu('Votre échéance de 25 000 FCFA est bien prévue demain.', p), 'PA');
  assert.equal(reconnu('Votre échéance de 25 000 FCFA était bien prévue demain.', p), null);
});

test('« vous confirmez » constate ou demande : ce n\'est pas l\'ordre « confirmez »', () => {
  const p = petit(phrase('PA', 'Confirmer le transfert'));
  assert.equal(reconnu('Confirmez le transfert', p), 'PA');
  assert.equal(reconnu('Vous confirmez le transfert', p), null);
  assert.equal(reconnu('Vous devez confirmer le transfert', petit(phrase('PB', 'Vous devez confirmer le transfert.'))), 'PB');
});

test('un « {date} » écrit tel quel dans la page : abstention, jamais d\'erreur', () => {
  const p = petit(phrase('PA', 'Votre échéance de {amount} est prévue le {date}.'));
  assert.equal(reconnu('Votre échéance de 25 000 FCFA est prévue le {date}.', p), null);
});

test('un nom ({name}) n\'est placé que par un modèle exact, jamais par le sens reconnu', () => {
  const p = petit(phrase('PA', 'Vous allez envoyer {amount} à {name}'));
  assert.equal(reconnu('Vous allez transférer 25 000 FCFA à Awa Ndongo', p), null);
});

test('deux traductions différentes pour une même forme : l\'original reste', () => {
  const p = petit(phrase('PA', 'Transfert effectué'), phrase('PB', 'Virement réussi'));
  assert.equal(reconnu('Transfert terminé', p), null);
});

test('une paraphrase vérifiée étend la reconnaissance à toutes ses formulations', () => {
  const sans = petit(phrase('PA', 'Votre solde est de {amount}'));
  const avec = petit(phrase('PA', 'Votre solde est de {amount}', ['Votre solde actuel est de {amount}']));
  assert.equal(reconnu('Votre solde actuel est de 25 000 FCFA', sans), null);
  assert.equal(reconnu('Votre solde actuel est de 25 000 FCFA', avec), 'PA');
  assert.equal(reconnu('VOTRE SOLDE ACTUEL EST DE 25 000 FCFA', avec), 'PA');
  assert.equal(traduire('Votre solde actuel est de 25 000 FCFA', avec).sortie, '[cible] PA 25 000 FCFA');
});

test('un mot seul ne suffit pas pour juger du sens', () => {
  const p = petit(phrase('PA', 'Confirmer'), phrase('PB', 'Transfert'));
  assert.equal(reconnu('Valider', p), null);
  assert.equal(reconnu('Virement', p), null);
});
