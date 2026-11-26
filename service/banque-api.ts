// Une banque distante, décrite par le profil du service (chemins, en-têtes, noms des champs, codes de refus) : le
// noyau la voit comme la banque simulée. Chaque appel porte la clé de l'équipe et l'identifiant du tour reçu de la
// passerelle des canaux, pour que le journal du service relie chaque intention déclarée aux appels réellement faits.
// L'adresse de la banque vient du profil, jamais de la requête reçue : la clé ne part que vers elle.

import type { Contact } from '../core/comprendre.ts';
import type { Banque, Demande, Mouvement, Preparation, Refus } from './banque.ts';

type Appel = 'compte' | 'historique' | 'beneficiaires' | 'frais' | 'preparer' | 'modifier' | 'confirmer' | 'annuler';

export interface ProfilBanque {
  base: string;
  entetes: { cle: string; trace: string };
  delai_ms: number;
  plafond: number;
  chemins: Record<Appel, string>;
  types: Record<Demande['intention'], string>;
  // Code d'erreur du service -> refus du noyau ; un code absent du profil est une panne
  refus: Record<string, Refus>;
  // Nom des champs dans les réponses du service, par ordre de préférence (« error.code » : champ imbriqué)
  champs: Record<string, string[]>;
  // Valeurs du sens d'une opération qui disent qu'elle est entrée sur le compte
  entrant: string[];
}

export interface Acces { profil: ProfilBanque; cle: string; trace: string; telephone: string; appeler?: typeof fetch }

const ECRITURES = new Set<Appel>(['preparer', 'modifier', 'confirmer', 'annuler']);
export const numeroLocal = (numero: string) => numero.replace(/\D/g, '').slice(-9);

function lire(objet: unknown, noms: string[] = []): unknown {
  for (const nom of noms) {
    const valeur = nom.split('.').reduce<unknown>((o, cle) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[cle] : undefined), objet);
    if (valeur !== undefined && valeur !== null) return valeur;
  }
  return undefined;
}

export function banqueApi({ profil: p, cle, trace, telephone, appeler = fetch }: Acces): Banque {
  const moi = numeroLocal(telephone);
  const champ = (objet: unknown, nom: string) => lire(objet, p.champs[nom]);
  const nombre = (objet: unknown, nom: string) => Number(champ(objet, nom) ?? Number.NaN);
  const texte = (objet: unknown, nom: string) => String(champ(objet, nom) ?? '');
  const liste = (objet: unknown): unknown[] => (Array.isArray(objet) ? objet : (champ(objet, 'liste') as unknown[]) || []);

  async function appel(nom: Appel, valeurs: Record<string, string | number> = {}, corps: object = {}) {
    const chemin = p.chemins[nom].replace(/\{(\w+)\}/g, (_, champ: string) => encodeURIComponent(String(valeurs[champ] ?? '')));
    const ecrit = ECRITURES.has(nom);
    const reponse = await appeler(`${p.base}/${chemin}`, {
      method: ecrit ? 'POST' : 'GET',
      headers: { [p.entetes.cle]: cle, [p.entetes.trace]: trace, accept: 'application/json', ...(ecrit ? { 'content-type': 'application/json' } : {}) },
      ...(ecrit ? { body: JSON.stringify(corps) } : {}),
      signal: AbortSignal.timeout(p.delai_ms),
    });
    const donnees: unknown = await reponse.json().catch(() => ({}));
    if (reponse.ok) return { donnees, refus: null };
    const code = String(champ(donnees, 'code') ?? reponse.status);
    if (!p.refus[code]) throw new Error(`banque : ${code}`);
    return { donnees, refus: p.refus[code] };
  }

  const compte = async () => (await appel('compte', { phone: moi })).donnees;
  const contact = (o: unknown): Contact => {
    const nom = texte(o, 'nom');
    return { id: numeroLocal(texte(o, 'telephone')), nom, alias: [nom.split(' ')[0].toLowerCase()], telephone: numeroLocal(texte(o, 'telephone')), type: 'mobile' };
  };
  const mouvement = (o: unknown): Mouvement => {
    const type = texte(o, 'type');
    const genre = type === p.types.credit ? 'credit' : type === p.types.facture ? 'facture' : p.entrant.includes(texte(o, 'sens').toLowerCase()) ? 'recu' : 'envoi';
    return { date: texte(o, 'date').slice(0, 10), type: genre, montant: Math.abs(nombre(o, 'montant')), nom: texte(o, 'nom') || texte(o, 'telephone') };
  };
  const corpsDe = (d: Demande) => ({ type: p.types[d.intention], from: moi, amount: d.montant, ...(d.intention === 'facture' ? { biller: d.facture } : { to: numeroLocal(d.telephone) }) });
  const preparation = (donnees: unknown, refus: Refus | null, demande: Demande, id?: string): Preparation => {
    if (refus) return { ok: false, refus };
    const frais = Number.isFinite(nombre(donnees, 'frais')) ? nombre(donnees, 'frais') : 0;
    const total = Number.isFinite(nombre(donnees, 'total')) ? nombre(donnees, 'total') : demande.montant + frais;
    return { ok: true, id: texte(donnees, 'id') || id || '', frais, total };
  };

  return {
    aujourdhui: async () => new Date().toISOString().slice(0, 10),
    async client() {
      const nom = texte(await compte(), 'titulaire');
      return { nom, prenom: nom.split(' ')[0], telephone: moi, compte: moi };
    },
    carnet: async () => liste((await appel('beneficiaires', { phone: moi, q: '' })).donnees).map(contact),
    solde: async () => nombre(await compte(), 'solde'),
    historique: async () => liste((await appel('historique', { phone: moi })).donnees).map(mouvement),
    bareme: async () => null,
    frais: async (montant) => nombre((await appel('frais', { amount: montant })).donnees, 'frais'),
    plafond: async () => p.plafond,
    factures: async () => [],
    async preparer(demande) {
      const { donnees, refus } = await appel('preparer', {}, corpsDe(demande));
      return preparation(donnees, refus, demande);
    },
    async modifier(id, demande) {
      const { amount, to } = corpsDe(demande) as { amount: number; to?: string };
      const { donnees, refus } = await appel('modifier', { id }, { amount, ...(to ? { to } : {}) });
      return preparation(donnees, refus, demande, id);
    },
    async confirmer(id) {
      const { donnees, refus } = await appel('confirmer', { id });
      if (refus) return { ok: false, refus };
      const solde = Number.isFinite(nombre(donnees, 'solde')) ? nombre(donnees, 'solde') : nombre(await compte(), 'solde');
      return { ok: true, reference: texte(donnees, 'reference') || id, solde };
    },
    async annuler(id) { await appel('annuler', { id }); },
  };
}
