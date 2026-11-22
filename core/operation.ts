// L'opération financière comprise, sous une seule forme pour tous les canaux (application, web, USSD, SMS,
// serveur vocal, guichet). Son empreinte ne dépend que de ce qui engage l'argent : l'intention, le montant et
// le destinataire (numéro ou facture). Ni le canal, ni la langue, ni l'heure, ni la façon de le dire n'y
// entrent : une même demande faite sur trois canaux donne trois fois la même empreinte.

export type Intention = 'transfert' | 'credit' | 'facture';

export interface Operation {
  intention: Intention;
  montant: number;
  // Numéro du bénéficiaire (transfert) ou du téléphone à recharger (crédit)
  telephone?: string;
  facture?: string;
}

// Champs triés, valeurs absentes retirées : la même opération s'écrit toujours de la même façon
export function canonique(operation: Operation): string {
  const champs: [string, unknown][] = [
    ['facture', operation.facture], ['intention', operation.intention], ['montant', operation.montant], ['telephone', operation.telephone],
  ];
  return JSON.stringify(Object.fromEntries(champs.filter(([, valeur]) => valeur !== undefined && valeur !== '')));
}

export async function empreinteOperation(operation: Operation): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonique(operation)));
  return 'op-' + [...new Uint8Array(octets)].slice(0, 8).map((o) => o.toString(16).padStart(2, '0')).join('');
}
