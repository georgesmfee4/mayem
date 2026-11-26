// La banque derrière la conversation. Le noyau ne connaît que ce contrat : la banque simulée ci-dessous pour les
// essais, ou une banque distante décrite par un profil (service/banque-api.ts), avec exactement les mêmes opérations.
// Une opération d'argent se fait en deux temps : la banque la prépare au récapitulatif (en attente, rien n'est
// débité), puis la confirme au tour suivant, après le « oui ». Tout est asynchrone, comme un vrai service. Les refus
// (solde insuffisant, plafond…) sont des réponses normales de la banque, rendues sous forme de code, jamais des plantages.

import type { Contact } from '../core/comprendre.ts';

export type TypeEnvoi = 'interne' | 'mobile' | 'banque';
export interface Client { nom: string; prenom: string; telephone: string; compte: string }
export interface Mouvement { date: string; type: 'recu' | 'envoi' | 'credit' | 'facture'; montant: number; nom: string; contact?: string; reference?: string }
export interface Facture { numero: string; type: string; montant: number; payee: boolean }
export interface Bareme { taux: number; min: number; max: number }
export type Refus = 'solde_insuffisant' | 'plafond_depasse' | 'facture_inconnue' | 'facture_payee' | 'montant_invalide'
  | 'beneficiaire_inconnu' | 'operation_expiree';
export type Resultat = { ok: true; reference: string; solde: number } | { ok: false; refus: Refus };
// Ce que la personne demande, tel que la banque le prépare
export type Demande =
  | { intention: 'transfert'; montant: number; telephone: string; nom: string; type: TypeEnvoi }
  | { intention: 'credit'; montant: number; telephone: string }
  | { intention: 'facture'; montant: number; facture: string };
// Une opération préparée : la banque la garde en attente, sans rien débiter, jusqu'à sa confirmation ou son annulation
export type Preparation = { ok: true; id: string; frais: number; total: number } | { ok: false; refus: Refus };

export interface Banque {
  aujourdhui(): Promise<string>;
  client(): Promise<Client>;
  carnet(): Promise<Contact[]>;
  solde(): Promise<number>;
  historique(): Promise<Mouvement[]>;
  // Barème qui se dit en taux, minimum et maximum ; null pour une grille par tranches
  bareme(type: TypeEnvoi): Promise<Bareme | null>;
  frais(montant: number, type: TypeEnvoi): Promise<number>;
  plafond(): Promise<number>;
  factures(): Promise<Facture[]>;
  preparer(demande: Demande): Promise<Preparation>;
  // Une correction (montant, bénéficiaire) garde la même opération en attente
  modifier(id: string, demande: Demande): Promise<Preparation>;
  // Le seul endroit où l'argent bouge ; le solde y est revérifié
  confirmer(id: string): Promise<Resultat>;
  annuler(id: string): Promise<void>;
}

type Envoi = { montant: number; telephone: string; nom: string; type: TypeEnvoi };
// Le service d'essai (fixtures/services/banque.js) exécute aussi directement, après son propre écran de confirmation
export type BanqueSimulee = Banque & {
  transferer(envoi: Envoi): Promise<Resultat>;
  acheterCredit(achat: { montant: number; telephone: string }): Promise<Resultat>;
  payerFacture(numero: string): Promise<Resultat>;
};

interface Donnees {
  aujourdhui: string; client: Client; solde: number; plafond: number; bareme: Record<TypeEnvoi, Bareme>;
  carnet: Contact[]; historique: Mouvement[]; factures: Facture[];
}

export const calculerFrais = (montant: number, { taux, min, max }: Bareme) =>
  taux === 0 ? 0 : Math.min(max, Math.max(min, Math.round(montant * taux)));

// Chaque banque simulée a ses propres données : deux conversations d'essai ne se mélangent jamais
export function banqueSimulee(source: Donnees): BanqueSimulee {
  const d: Donnees = structuredClone(source);
  let numero = 0;
  let preparees = 0;
  const enAttente = new Map<string, Demande>();
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

  // Frais et total de la demande, ou ce que la banque refuserait : vérifié à la préparation, revérifié à la confirmation
  function chiffrer(demande: Demande): Refus | { frais: number; total: number } {
    if (demande.intention === 'facture') {
      const facture = d.factures.find((f) => f.numero === demande.facture);
      if (!facture) return 'facture_inconnue';
      if (facture.payee) return 'facture_payee';
    }
    if (!Number.isFinite(demande.montant) || demande.montant <= 0) return 'montant_invalide';
    if (demande.montant > d.plafond) return 'plafond_depasse';
    const frais = demande.intention === 'transfert' ? calculerFrais(demande.montant, d.bareme[demande.type]) : 0;
    return demande.montant + frais > d.solde ? 'solde_insuffisant' : { frais, total: demande.montant + frais };
  }

  function preparation(id: string, demande: Demande): Preparation {
    const chiffre = chiffrer(demande);
    if (typeof chiffre === 'string') return { ok: false, refus: chiffre };
    enAttente.set(id, demande);
    return { ok: true, id, ...chiffre };
  }

  async function transferer({ montant, telephone, nom, type }: Envoi): Promise<Resultat> {
    const contact = d.carnet.find((c) => c.telephone === telephone);
    return debiter(montant + calculerFrais(montant, d.bareme[type]), montant, { type: 'envoi', montant, nom, ...(contact ? { contact: contact.id } : {}) });
  }

  async function acheterCredit({ montant, telephone }: { montant: number; telephone: string }): Promise<Resultat> {
    return debiter(montant, montant, { type: 'credit', montant, nom: telephone });
  }

  async function payerFacture(numeroFacture: string): Promise<Resultat> {
    const facture = d.factures.find((f) => f.numero === numeroFacture);
    if (!facture) return { ok: false, refus: 'facture_inconnue' };
    if (facture.payee) return { ok: false, refus: 'facture_payee' };
    const resultat = debiter(facture.montant, facture.montant, { type: 'facture', montant: facture.montant, nom: facture.type });
    if (resultat.ok) facture.payee = true;
    return resultat;
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
    preparer: async (demande) => preparation(`ATT-${String(++preparees).padStart(6, '0')}`, demande),
    modifier: async (id, demande) => (enAttente.has(id) ? preparation(id, demande) : { ok: false, refus: 'operation_expiree' }),
    async confirmer(id) {
      const demande = enAttente.get(id);
      if (!demande) return { ok: false, refus: 'operation_expiree' };
      enAttente.delete(id);
      if (demande.intention === 'transfert') return transferer(demande);
      return demande.intention === 'credit' ? acheterCredit(demande) : payerFacture(demande.facture);
    },
    annuler: async (id) => { enAttente.delete(id); },
    transferer,
    acheterCredit,
    payerFacture,
  };
}
