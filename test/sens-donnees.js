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
];

// Hors de portée de la forme canonique seule : un mot en plus ou en moins (« actuel », « Attention »)
// suffit à empêcher la reconnaissance, tant qu'aucune paraphrase vérifiée ne couvre cette formulation.
// Ils disent honnêtement ce que la méthode ne fait pas ; aucun ne doit recevoir une autre traduction.
export const HORS_PORTEE = [
  ['Le solde de votre compte est de 25 000 FCFA', 'X08'],
  ['Votre solde actuel est de 25 000 FCFA', 'X08'],
  ['Une erreur s\'est produite. Veuillez réessayer.', 'X22'],
  ['Numéro incorrect', 'X21'],
  ['Retour à la page d\'accueil', 'X03'],
  ['Ne communiquez jamais votre code secret. Aucun agent ne vous le demandera.', 'X24'],
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
];

// Pièges qui disent exactement ce que dit une autre phrase validée : la reconnaître est juste.
// Chaque entrée a été relue ; toute autre reconnaissance d'un piège fait échouer les tests.
export const AUTRE_PHRASE_JUSTE = new Map([
  ['Votre transfert a été reçu avec succès.', 'A14'],
  ['Transfert envoyé', 'C02'],
  ['Virement envoyé', 'C02'],
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

// Chaque règle appliquée seule à chaque phrase validée et à chaque paraphrase reconnue (ce qui éprouve
// la forme canonique elle-même), puis le même texte en capitales sans accents
export function pieges(pack) {
  const sources = [...pack.phrases.filter((p) => p.valide && p.cible).map((p) => [exemple(p.fr), p.id]), ...PARAPHRASES];
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
