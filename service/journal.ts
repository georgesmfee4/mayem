// Une ligne par tour de conversation, aux colonnes du tableau de bord du jury SAFINUM : équipe, canal, langue,
// requête, intention, paramètres extraits, réponse, statut de la transaction, temps d'exécution, erreurs et
// résultat de la validation. S'y ajoutent l'empreinte de l'opération (la même sur tous les canaux) et la raison
// de l'interprétation. Le journal reste dans l'environnement de test ; il ne contient ni code PIN ni nom de traducteur.

import type { Comprehension } from '../core/comprendre.ts';
import type { Operation } from '../core/operation.ts';
import type { Rendu } from './reponses.ts';

export type Statut = 'information' | 'clarification' | 'en_attente_confirmation' | 'executee' | 'refusee' | 'annulee' | 'erreur';

export interface LigneJournal {
  equipe: string;
  session: string;
  canal: string;
  langue: string;
  requete: string;
  intention: string;
  raison: string;
  parametres: Record<string, unknown>;
  reponse: string;
  // Réponses dites : référence du modèle, et s'il a été traduit (validé) ou laissé en français
  reponses: { ref: string; langue: string; traduit: boolean }[];
  statut: Statut;
  validation: string;
  operation: Operation | null;
  empreinte: string | null;
  temps_ms: number;
  erreurs: string[];
}

interface Entree {
  session: { id: string; canal: string; langue: string };
  comprehension: Comprehension;
  decision: { statut: Statut; validation: string; operation?: Operation; parametres?: Record<string, unknown> };
  rendus: Rendu[];
  empreinte: string | null;
  erreurs: string[];
  duree: number;
}

// Ce que la demande contenait, quand la décision n'a rien retenu de plus précis
function extraits(c: Comprehension): Record<string, unknown> {
  const gardes = <T extends { rejete: boolean }>(liste: T[]) => liste.filter((v) => !v.rejete);
  const valeurs: Record<string, unknown> = {};
  if (gardes(c.montants).length) valeurs.montants = gardes(c.montants).map((v) => v.valeur);
  if (gardes(c.telephones).length) valeurs.telephones = gardes(c.telephones).map((t) => t.numero);
  if (gardes(c.contacts).length) valeurs.contacts = gardes(c.contacts).map((m) => m.contacts.map((k) => k.nom));
  if (c.facture) valeurs.facture = c.facture;
  if (c.typeFacture) valeurs.type_facture = c.typeFacture;
  if (c.terme) valeurs.terme = c.terme.terme;
  if (c.periode) valeurs.periode = c.periode;
  if (c.negation) valeurs.negation = true;
  return valeurs;
}

export function ligneJournal({ session, comprehension: c, decision, rendus, empreinte, erreurs, duree }: Entree): LigneJournal {
  const sansVide = Object.fromEntries(Object.entries(decision.parametres || {}).filter(([, v]) => v !== undefined && v !== null));
  return {
    equipe: 'Mayem',
    session: session.id,
    canal: session.canal,
    langue: session.langue,
    requete: c.texte,
    intention: c.intention || (c.hesitation.length ? `hésitation : ${c.hesitation.join(' ou ')}`
      : c.touche ? `choix ${c.touche}` : Object.keys(extraits(c)).length ? 'précision à la question posée' : 'non comprise'),
    raison: c.raison,
    parametres: Object.keys(sansVide).length ? sansVide : extraits(c),
    reponse: rendus.map((r) => r.texte).join('\n'),
    reponses: rendus.map(({ ref, langue, traduit }) => ({ ref, langue, traduit })),
    statut: decision.statut,
    validation: decision.validation,
    operation: decision.operation || null,
    empreinte,
    temps_ms: Math.round(duree * 10) / 10,
    erreurs,
  };
}
