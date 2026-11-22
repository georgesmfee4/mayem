// La banque derrière la conversation. Le noyau ne connaît que ce contrat : la banque simulée ci-dessous pour les
// essais, puis le bac à sable SAFINUM quand sa documentation sera reçue, avec exactement les mêmes opérations.
// Tout est asynchrone, comme le sera un vrai service. Les refus (solde insuffisant, plafond…) sont des
// réponses normales de la banque, rendues sous forme de code, jamais des plantages.

import type { Contact } from '../core/comprendre.ts';

export type TypeEnvoi = 'interne' | 'mobile' | 'banque';
export interface Client { nom: string; prenom: string; telephone: string; compte: string }
export interface Mouvement { date: string; type: 'recu' | 'envoi' | 'credit' | 'facture'; montant: number; nom: string; contact?: string; reference?: string }
export interface Facture { numero: string; type: string; montant: number; payee: boolean }
export interface Bareme { taux: number; min: number; max: number }
export type Refus = 'solde_insuffisant' | 'plafond_depasse' | 'facture_inconnue' | 'facture_payee' | 'montant_invalide';
export type Resultat = { ok: true; reference: string; solde: number } | { ok: false; refus: Refus };

export interface Banque {
  aujourdhui(): Promise<string>;
  client(): Promise<Client>;
  carnet(): Promise<Contact[]>;
  solde(): Promise<number>;
  historique(): Promise<Mouvement[]>;
  bareme(type: TypeEnvoi): Promise<Bareme>;
  frais(montant: number, type: TypeEnvoi): Promise<number>;
  plafond(): Promise<number>;
  factures(): Promise<Facture[]>;
  transferer(envoi: { montant: number; telephone: string; nom: string; type: TypeEnvoi }): Promise<Resultat>;
  acheterCredit(achat: { montant: number; telephone: string }): Promise<Resultat>;
  payerFacture(numero: string): Promise<Resultat>;
}

interface Donnees {
  aujourdhui: string; client: Client; solde: number; plafond: number; bareme: Record<TypeEnvoi, Bareme>;
  carnet: Contact[]; historique: Mouvement[]; factures: Facture[];
}

export const calculerFrais = (montant: number, { taux, min, max }: Bareme) =>
  taux === 0 ? 0 : Math.min(max, Math.max(min, Math.round(montant * taux)));

// Chaque banque simulée a ses propres données : deux conversations d'essai ne se mélangent jamais
export function banqueSimulee(source: Donnees): Banque {
  const d: Donnees = structuredClone(source);
  let numero = 0;
  const reference = () => `SIM-${d.aujourdhui.slice(0, 4)}-${String(++numero).padStart(6, '0')}`;
  const noter = (m: Mouvement) => { d.historique.unshift(m); };

  // Débite le compte si possible ; sinon rend le refus, sans rien changer
  function debiter(total: number, montant: number, mouvement: Omit<Mouvement, 'date' | 'reference'>): Resultat {
    if (!Number.isFinite(montant) || montant <= 0) return { ok: false, refus: 'montant_invalide' };
    if (montant > d.plafond) return { ok: false, refus: 'plafond_depasse' };
    if (total > d.solde) return { ok: false, refus: 'solde_insuffisant' };
    d.solde -= total;
    const ref = reference();
    noter({ ...mouvement, date: d.aujourdhui, reference: ref });
    return { ok: true, reference: ref, solde: d.solde };
  }

  return {
    aujourdhui: async () => d.aujourdhui,
    client: async () => ({ ...d.client }),
    carnet: async () => d.carnet.map((c) => ({ ...c, alias: [...c.alias] })),
    solde: async () => d.solde,
    historique: async () => d.historique.map((m) => ({ ...m })),
    bareme: async (type) => ({ ...d.bareme[type] }),
    frais: async (montant, type) => calculerFrais(montant, d.bareme[type]),
    plafond: async () => d.plafond,
    factures: async () => d.factures.map((f) => ({ ...f })),
    async transferer({ montant, telephone, nom, type }) {
      const contact = d.carnet.find((c) => c.telephone === telephone);
      return debiter(montant + calculerFrais(montant, d.bareme[type]), montant, { type: 'envoi', montant, nom, ...(contact ? { contact: contact.id } : {}) });
    },
    async acheterCredit({ montant, telephone }) {
      return debiter(montant, montant, { type: 'credit', montant, nom: telephone });
    },
    async payerFacture(numeroFacture) {
      const facture = d.factures.find((f) => f.numero === numeroFacture);
      if (!facture) return { ok: false, refus: 'facture_inconnue' };
      if (facture.payee) return { ok: false, refus: 'facture_payee' };
      const resultat = debiter(facture.montant, facture.montant, { type: 'facture', montant: facture.montant, nom: facture.type });
      if (resultat.ok) facture.payee = true;
      return resultat;
    },
  };
}
