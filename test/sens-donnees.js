// Jeu d'essai du niveau 3 (sens reconnu), côté français uniquement : aucune traduction n'est écrite ici.
// - paraphrases : une autre façon d'écrire une phrase validée, qui doit mener à sa traduction ;
// - pieges : un seul mot change le sens (négation, sens de l'argent, temps, personne, action, modalité) ;
//   aucun ne doit recevoir la traduction d'une phrase validée.
// Les pièges écrits à la main s'ajoutent à ceux que pieges() fabrique sur tout le corpus.

import { sansAccents } from '../core/langage.ts';

// [texte, id de la phrase validée attendue]
export const PARAPHRASES = [
  ['Votre virement a bien été envoyé.', 'C02'],
  ['Votre transfert a été envoyé.', 'C02'],
  ['Transfert envoyé avec succès.', 'C02'],
  ['VOTRE VIREMENT A ETE ENVOYE AVEC SUCCES', 'C02'],
  ['Virement effectué', 'C01'],
  ['Transfert réussi', 'C01'],
  ['Votre transfert a été effectué.', 'C01'],
  ['Virement terminé', 'C01'],
  ['VIREMENT EFFECTUE', 'C01'],
  ['Transaction réussie', 'X17'],
  ['Opération effectuée', 'X17'],
  ["L'opération a réussi.", 'X17'],
  ['Transaction en cours de traitement', 'X18'],
  ['Votre opération est en cours de traitement.', 'X18'],
  ['Solde insuffisant pour effectuer ce virement.', 'E06'],
  ['Votre solde est insuffisant pour effectuer ce transfert.', 'E06'],
  ['Votre solde est insuffisant.', 'X20'],
  ['La somme doit être supérieure à zéro.', 'E05'],
  ['Erreur de réseau : le service est momentanément indisponible. Veuillez réessayer.', 'E10'],
  ['Un problème est survenu. Veuillez réessayer.', 'X22'],
  ['Une erreur est survenue. Réessayez.', 'X22'],
  ['Un problème est survenu', 'E01'],
  ['Veuillez vérifier les informations avant de confirmer le virement.', 'R01'],
  ['Contrôlez les informations avant de confirmer le transfert.', 'R01'],
  ['Vérifiez le nom et le numéro du destinataire avant de confirmer un virement.', 'S02'],
  ['Veuillez saisir le nom et le numéro du destinataire.', 'E07'],
  ['Saisissez le nom et le numéro du bénéficiaire.', 'E07'],
  ['Vous devez confirmer les informations avant de valider le virement.', 'E11'],
  ["J'ai bien vérifié le nom et le numéro du destinataire.", 'B07'],
  ['Je confirme que les informations ci-dessus sont exactes.', 'R07'],
  ['Attention : ne communiquez jamais votre code secret. Aucun agent ne vous le demandera.', 'X24'],
  ['Attention : ne partagez jamais votre code PIN. Aucun agent ne vous le demandera.', 'X24'],
  ['Votre code de confirmation est 4821. Ne le communiquez à personne.', 'X26'],
  ["Frais de la transaction : 500 FCFA", 'X12'],
  ["Commission de l'opération : 500 FCFA", 'X12'],
  ['Référence de la transaction : TX-482913', 'X19'],
  ['Numéro du destinataire : +237 699 00 00 00', 'X11'],
  ['Vérifiez le nom et le numéro du destinataire avant de confirmer. Une transaction confirmée ne peut pas être annulée.', 'X16'],
  ['Cette transaction est irréversible', 'X27'],
  ['Cette opération est définitive', 'X27'],
  ['Ce destinataire n\'a jamais été utilisé sur ce compte. Vérifiez le numéro avant de continuer.', 'B02'],
  ['Alerte de sécurité : ce destinataire n\'a jamais été utilisé sur ce compte.', 'E09'],
  ['Alerte de sécurité : veuillez vérifier le numéro du destinataire avant de continuer.', 'E08'],
  ['Choisissez le type de virement et la somme. Les frais sont calculés automatiquement.', 'F02'],
  ['Consultez votre solde et lancez un virement en toute sécurité.', 'A04'],
  ['Somme à envoyer', 'F09'],
  ['Solde après transaction', 'F12'],
  ['Effectuer un virement', 'A09'],
  ["Transférer de l'argent", 'X09'],
  ['Voir le solde', 'X07'],
  ['Afficher le solde', 'X07'],
  ['Confirmer le virement', 'R09'],
  ['Confirmez le transfert', 'R09'],
  ['CONFIRMER LE VIREMENT', 'R09'],
  ['Nouveau virement', 'C05'],
  ['Virement reçu', 'A14'],
  ['Frais de virement', 'F01'],
  ['Commission de transfert', 'F01'],
  ['Historique des opérations', 'X06'],
  ['Opérations récentes', 'A11'],
  ['Entrez votre code secret', 'X25'],
  ['Somme invalide', 'X23'],
  ['Récapitulatif de la transaction', 'X28'],
  ['Motif du virement', 'B05'],
  ['Numéro du destinataire', 'X10'],
  ['Nom du destinataire', 'B03'],
  // Couverts depuis par une paraphrase vérifiée (packs/bum/paraphrases.csv)
  ['Le solde de votre compte est de 25 000 FCFA', 'X08'],
  ['Votre solde actuel est de 25 000 FCFA', 'X08'],
  ['Une erreur s\'est produite. Veuillez réessayer.', 'X22'],
  ['Numéro incorrect', 'X21'],
  ['Retour à la page d\'accueil', 'X03'],
  ['Ne communiquez jamais votre code secret. Aucun agent ne vous le demandera.', 'X24'],
  // Tenus à l'écart du pack : reconnus par la forme canonique seule, sans paraphrase écrite ainsi
  ['VOUS AVEZ RECU 15 000 FCFA DE MARIE NGO. NOUVEAU SOLDE : 265 000 FCFA.', 'MSG001'],
  ['Votre compte est bloqué. Veuillez contacter le service client.', 'MSG010'],
  ['Vous avez atteint le plafond journalier.', 'MSG012'],
  ['Votre prêt de 50 000 FCFA a bien été approuvé.', 'MSG016'],
  ['Votre cotisation de 2 000 FCFA a bien été enregistrée.', 'MSG019'],
  ['Si vous n\'êtes pas à l\'origine de cette transaction, appelez le service client.', 'MSG022'],
  ['Contrôlez le nom du destinataire avant de confirmer.', 'MSG023'],
  ['Ce numéro n\'est pas enregistré sur Mobile Money', 'MSG024'],
  ['Le destinataire recevra 25 000 FCFA.', 'MSG025'],
  ['Transaction en attente. Composez #150# pour la confirmer.', 'MSG013'],
  ['Votre facture de 7 500 FCFA a bien été payée. Référence : TX-482913.', 'MSG006'],
  ['Le transfert a bien été effectué', 'C01'],
  ['Saisissez un montant supérieur à zéro.', 'E05'],
  ['Vérifiez bien les informations avant de valider le transfert.', 'R01'],
  ['Les frais sont calculés automatiquement. Choisissez le type de transfert et le montant.', 'F02'],
  ['NUMERO DE TELEPHONE INVALIDE', 'X21'],
  ['Transfert immédiat sans frais', 'F05'],
  ['Votre solde s\'élève à 25 000 FCFA', 'X08'],
  ['Je confirme que les informations sont correctes.', 'R07'],
  ['Opération réalisée avec succès.', 'X17'],
  ['Votre virement a bien été transmis avec succès.', 'C02'],
  ['Envoyez de l\'argent', 'X09'],
  ['Solde du compte : 25 000 FCFA', 'X08'],
  ['Frais de la transaction : 500 FCFA', 'X12'],
  ['Référence de la transaction : TX-482913', 'X19'],
  ['Total prélevé : 10 150 FCFA', 'X14'],
  ['Montant à transférer', 'F09'],
  ['Votre code de confirmation : 4821. Ne le communiquez à personne.', 'X26'],
  ['Cette transaction est définitive', 'X27'],
  ['Veuillez renseigner les coordonnées du destinataire.', 'E07'],
];

// Hors de portée de la forme canonique seule : un mot en plus ou en moins (« actuel », « Attention »)
// suffit à empêcher la reconnaissance, tant qu'aucune paraphrase vérifiée ne couvre cette formulation.
// Ils disent honnêtement ce que la méthode ne fait pas ; aucun ne doit recevoir une autre traduction.
export const HORS_PORTEE = [
  // Tenus à l'écart du pack (aucune paraphrase vérifiée ne les écrit ainsi), mesurés le 20 novembre
  ['Vous avez bien reçu 15 000 FCFA de Marie Ngo. Nouveau solde : 265 000 FCFA.', 'MSG001'],
  ['Retrait de 10 000 FCFA effectué. Commission : 150 FCFA. Nouveau solde : 90 000 FCFA.', 'MSG003'],
  ['Code PIN incorrect. Il vous reste 2 tentatives.', 'MSG008'],
  ['Opération annulée. Aucun montant n\'a été prélevé.', 'MSG014'],
  ['Le service est temporairement indisponible. Réessayez plus tard.', 'MSG015'],
  ['Attention : aucun agent ne vous demandera votre code PIN.', 'MSG020'],
  ['Ne répondez pas aux SMS vous annonçant un gain. C\'est une arnaque.', 'MSG021'],
  ['Frais inclus : 150 FCFA. Montant total : 10 150 FCFA.', 'MSG026'],
  ['Votre code de validation est 4821. Il expire dans 5 minutes.', 'MSG007'],
  ['Votre échéance de 25 000 FCFA est fixée au 15/12/2026.', 'MSG017'],
  ['Ne communiquez jamais votre PIN. Aucun agent ne vous le demandera.', 'X24'],
  ['Veuillez vérifier le numéro du bénéficiaire avant de continuer.', 'E08'],
  ['Opération en cours de traitement, veuillez patienter', 'X18'],
  ['Fonds insuffisants pour ce transfert.', 'E06'],
];

// Pièges écrits à la main : [texte, ce qui change, phrase validée dont il ne doit pas recevoir la traduction]
export const PIEGES = [
  ["Votre transfert n'a pas été envoyé.", 'négation', 'C02'],
  ['Votre transfert sera envoyé.', 'temps', 'C02'],
  ['Votre transfert a été reçu avec succès.', "sens de l'argent", 'C02'],
  ["Vérifiez le nom et le numéro du bénéficiaire avant d'annuler.", 'action', 'X16'],
  ['Vous pouvez confirmer les informations avant de valider le transfert.', 'modalité', 'E11'],
  ['Vous avez vérifié le nom et le numéro du bénéficiaire.', 'personne', 'B07'],
  ['Vérifiez le nom et le numéro du bénéficiaire.', 'personne', 'B07'],
  ['Le montant doit être inférieur à zéro.', 'action', 'E05'],
  ['Solde suffisant pour effectuer ce transfert.', 'négation', 'E06'],
  ['Partagez votre code secret. Un agent vous le demandera.', 'négation', 'X24'],
  ['Attention : ne partagez jamais votre code. Aucun agent ne vous le demandera.', 'objet', 'X24'],
  ['Votre code de confirmation est 4821. Partagez-le avec votre agent.', 'négation', 'X26'],
  ['Cette opération est réversible', 'négation', 'X27'],
  ['Ce bénéficiaire a déjà été utilisé sur ce compte.', 'négation', 'E09'],
  ['Transfert envoyé', "sens de l'argent", 'A14'],
  ["Frais de l'opération : 500 FCFA ou 200 FCFA", 'valeurs', 'X12'],
  ['Une erreur est survenue. Ne réessayez pas.', 'négation', 'X22'],
  ['Opération annulée', 'action', 'X17'],
  ['Montant à recevoir', "sens de l'argent", 'F09'],
  ['Solde avant opération', 'temps', 'F12'],
  ['Votre transfert va être envoyé.', 'temps', 'C02'],
  ['Mon solde est insuffisant pour effectuer ce transfert.', 'personne', 'E06'],
  ['Virement à effectuer', 'temps', 'C01'],
  ['Montant débité', 'temps', 'F09'],
  ['Votre virement est en cours.', 'temps', 'C01'],
  // Messages types (lexique relu, pack 0.8)
  ['Vous avez envoyé 15 000 FCFA à Marie Ngo. Nouveau solde : 265 000 FCFA.', "sens de l'argent", 'MSG001'],
  ['Vous avez reçu 15 000 FCFA de Marie Ngo. Ancien solde : 265 000 FCFA.', 'temps', 'MSG001'],
  ['Le bénéficiaire a reçu 25 000 FCFA.', 'temps', 'MSG025'],
  ['Le bénéficiaire ne recevra pas 25 000 FCFA.', 'négation', 'MSG025'],
  ['Opération annulée. Un montant a été débité.', 'négation', 'MSG014'],
  ['Votre prêt de 25 000 FCFA a été refusé.', 'action', 'MSG016'],
  ['Votre prêt de 25 000 FCFA sera approuvé.', 'temps', 'MSG016'],
  ['Retrait de 25 000 FCFA effectué sur votre compte.', "sens de l'argent", 'MSG004'],
  ['Code PIN correct. Il vous reste 2 essais.', 'négation', 'MSG008'],
  ["Vous n'avez pas atteint votre plafond journalier.", 'négation', 'MSG012'],
  ['Attention : un agent vous demandera votre code PIN.', 'négation', 'MSG020'],
  ['Répondez aux messages vous annonçant un gain.', 'négation', 'MSG021'],
  ["Votre facture de 25 000 FCFA n'a pas été payée. Référence : TX-482913.", 'négation', 'MSG006'],
  ['Frais non compris : 150 FCFA. Montant total : 10 150 FCFA.', 'négation', 'MSG026'],
  ["Si vous êtes à l'origine de cette opération, appelez le service client.", 'négation', 'MSG022'],
  ['Vérifiez le nom du bénéficiaire après avoir confirmé.', 'temps', 'MSG023'],
  ['Ce numéro est enregistré sur Mobile Money.', 'négation', 'MSG024'],
  ['Votre cotisation de 25 000 FCFA a été annulée.', 'action', 'MSG019'],
  ['Votre échéance de 25 000 FCFA était prévue le 15/12/2026.', 'temps', 'MSG017'],
  ['Votre compte est débloqué. Contactez le service client.', 'négation', 'MSG010'],
  ['Le service est disponible. Réessayez plus tard.', 'négation', 'MSG015'],
  ['Retrait de 25 000 FCFA refusé. Frais : 150 FCFA. Nouveau solde : 265 000 FCFA.', 'action', 'MSG003'],
  ["Opération en attente. Composez #150# pour l'annuler.", 'action', 'MSG013'],
  ['Votre code de confirmation est 4821. Il a expiré il y a 5 minutes.', 'temps', 'MSG007'],
];

// Pièges qui disent exactement ce que dit une autre phrase validée : la reconnaître est juste.
// Chaque entrée a été relue ; toute autre reconnaissance d'un piège fait échouer les tests.
export const AUTRE_PHRASE_JUSTE = new Map([
  ['Votre transfert a été reçu avec succès.', 'A14'],
  ['Transfert envoyé', 'C02'],
  ['Virement envoyé', 'C02'],
  // Juste une fois vérifiée la paraphrase « Votre argent a été envoyé avec succès. » de C02
  ['Argent envoyé', 'C02'],
  // Justes une fois vérifiée la paraphrase « Opération en cours » de X18 (packs/bum/paraphrases.csv)
  ['Opération en cours', 'X18'],
  ['OPERATION EN COURS', 'X18'],
  ['Transaction en cours', 'X18'],
  ['TRANSACTION EN COURS', 'X18'],
]);

// Pièges fabriqués sur chaque phrase du corpus : [motif, remplacement, ce qui change]
const REGLES = [
  [/\bn'a jamais été\b/u, 'a déjà été', 'négation'],
  [/\bn'a pas été\b/u, 'a été', 'négation'],
  [/\bne (\p{L}+) jamais\b/u, '$1 toujours', 'négation'],
  [/\bne (\p{L}+) pas\b/u, '$1', 'négation'],
  [/\bne (\p{L}+) avec personne\b/u, '$1 avec votre agent', 'négation'],
  [/\bAucun\b/u, 'Un', 'négation'],
  [/\best\b/u, "n'est pas", 'négation'],
  [/\ba été\b/u, "n'a pas été", 'négation'],
  [/\bsont\b/u, 'ne sont pas', 'négation'],
  [/^Vérifiez\b/u, 'Ne vérifiez pas', 'négation'],
  [/\ba été\b/u, 'sera', 'temps'],
  [/\best\b/u, 'était', 'temps'],
  [/\ba été\b/u, 'avait été', 'temps'],
  [/\bdébité\b/u, 'à débiter', 'temps'],
  [/\bà débiter\b/u, 'débité', 'temps'],
  [/\bà envoyer\b/u, 'envoyé', 'temps'],
  [/\beffectué\b/u, 'à effectuer', 'temps'],
  [/\breçu\b/u, 'à recevoir', 'temps'],
  [/\bréussie\b/u, 'en cours', 'temps'],
  [/\baprès\b/u, 'avant', 'temps'],
  [/\bavant\b/u, 'après', 'temps'],
  [/\benvoyé\b/u, 'reçu', "sens de l'argent"],
  [/\breçu\b/u, 'envoyé', "sens de l'argent"],
  [/\benvoyer\b/u, 'recevoir', "sens de l'argent"],
  [/\bdébit/u, 'crédit', "sens de l'argent"],
  [/\bconfirmer\b/u, 'annuler', 'action'],
  [/\bConfirmer\b/u, 'Annuler', 'action'],
  [/\bconfirmée\b/u, 'annulée', 'action'],
  [/\bvalider\b/u, 'annuler', 'action'],
  [/\bcontinuer\b/u, 'annuler', 'action'],
  [/\bpartagez\b/u, 'gardez', 'action'],
  [/\bsupérieur\b/u, 'inférieur', 'action'],
  [/\binsuffisant\b/u, 'suffisant', 'négation'],
  [/\bgratuit\b/u, 'payant', 'action'],
  [/\binvalide\b/u, 'valide', 'négation'],
  [/\bréussie\b/u, 'échouée', 'négation'],
  [/\birréversible\b/u, 'réversible', 'négation'],
  [/\bindisponible\b/u, 'disponible', 'négation'],
  [/\bcorrectes\b/u, 'incorrectes', 'négation'],
  [/^Vérifiez\b/u, "J'ai vérifié", 'personne'],
  [/^Je confirme\b/u, 'Vous confirmez', 'personne'],
  [/^J'ai vérifié\b/u, 'Vous avez vérifié', 'personne'],
  [/\bVotre\b/u, 'Mon', 'personne'],
  [/\bvotre\b/u, 'mon', 'personne'],
  [/\bdevez\b/u, 'pouvez', 'modalité'],
  [/\bdoit\b/u, 'peut', 'modalité'],
  [/\bne peut pas\b/u, 'peut', 'modalité'],
  [/\bsecret\b/u, 'de parrainage', 'objet'],
  [/\bbénéficiaire\b/u, 'agent', 'objet'],
  [/\bsolde\b/u, 'plafond', 'objet'],
  [/\btransfert\b/u, 'retrait', 'objet'],
  [/\bnuméro\b/u, 'adresse', 'objet'],
  [/\bcompte\b/u, 'carte', 'objet'],
  [/\bfrais\b/u, 'bonus', 'objet'],
  [/\bmontant\b/u, 'plafond', 'objet'],
  [/\binformations\b/u, 'conditions', 'objet'],
  [/\bnom\b/u, 'prénom', 'objet'],
  [/\btoujours\b/u, 'jamais', 'négation'],
  [/\bréessayer\b/u, 'abandonner', 'action'],
  [/\bRéessayez\b/u, 'Abandonnez', 'action'],
  [/\btemporairement\b/u, 'définitivement', 'temps'],
  [/\bjamais été utilisé\b/u, 'été utilisé plusieurs fois', 'négation'],
  [/25 000 FCFA/u, '25 000 FCFA et 500 FCFA', 'valeurs'],
  [/25 000 FCFA/u, '25 %', 'valeurs'],
  [/4821/u, '4821 ou 9934', 'valeurs'],
  [/\.$/u, ' (2).', 'valeurs'],
  [/^(\p{Lu}[\p{L}' ]+)$/u, '$1 2', 'valeurs'],
];

// Valeurs d'exemple à la place des champs {…}
const exemple = (texte) => texte.replace(/\{amount(_\d+)?\}/g, '25 000 FCFA').replace(/\{percent\}/g, '2 %')
  .replace(/\{phone\}/g, '+237 699 00 00 00').replace(/\{account\}/g, 'CM21 1000 2000 3000').replace(/\{ref\}/g, 'TX-482913')
  .replace(/\{code\}/g, '4821').replace(/\{name\}/g, 'Awa Ndongo').replace(/\{date\}/g, '15/12/2026')
  .replace(/\{fee\}/g, '150 FCFA').replace(/\{count\}/g, '2');

// Chaque règle appliquée seule à chaque phrase validée, à ses paraphrases vérifiées et à chaque paraphrase reconnue (ce qui éprouve
// la forme canonique elle-même), puis le même texte en capitales sans accents
export function pieges(pack) {
  const validees = pack.phrases.filter((p) => p.valide && p.cible);
  // Les paraphrases vérifiées du pack aussi : chacune élargit ce que le moteur reconnaît, chacune est éprouvée
  const sources = [...validees.flatMap((p) => [p.fr, ...(p.variantes || [])].map((texte) => [exemple(texte), p.id])), ...PARAPHRASES];
  const sortie = [...PIEGES];
  for (const [source, id] of sources) {
    for (const [motif, remplacement, change] of REGLES) {
      const texte = source.replace(motif, remplacement);
      if (texte === source) continue;
      sortie.push([texte, change, id], [sansAccents(texte).toUpperCase(), `${change}, sans accents`, id]);
    }
  }
  return sortie;
}
