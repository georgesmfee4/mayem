// Un service bancaire « existant », en français, tel que Mayem en rencontre : un menu USSD (convention CON/END) et
// une API JSON pour son application mobile. Mayem s'y branche sans le modifier. Il sert aux essais et de démonstration
// de secours si le bac à sable SAFINUM manque. Données fictives (service/banque-essai.json) ; code PIN d'essai : 1234.

import { readFileSync } from 'node:fs';
import { banqueSimulee } from '../../service/banque.ts';

export const PIN_ESSAI = '1234';
const donnees = () => JSON.parse(readFileSync(new URL('../../service/banque-essai.json', import.meta.url), 'utf8'));
const fcfa = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
const jour = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const LIBELLES = { recu: 'Transfert reçu', envoi: 'Transfert effectué', credit: 'Achat de crédit', facture: 'Facture électricité' };
const telephoneValide = (t) => /^6\d{8}$/.test(t);
const montantValide = (m) => /^\d+$/.test(m) && Number(m) > 0;

export function serviceBanque(banque = banqueSimulee(donnees())) {
  const nomDe = async (telephone) => (await banque.carnet()).find((c) => c.telephone === telephone);

  async function recapitulatif(telephone, montant) {
    const contact = await nomDe(telephone);
    const frais = await banque.frais(montant, contact?.type || 'mobile');
    return { nom: contact?.nom || telephone, connu: Boolean(contact), type: contact?.type || 'mobile', frais, total: montant + frais };
  }

  // Avant la confirmation, rien n'est retiré : « Total à débiter ». Un numéro hors du carnet n'a pas de nom à afficher.
  const envoi = (r, montant, numero) => (r.connu ? [`Vous allez envoyer ${fcfa(montant)} à ${r.nom}`] : [`Montant : ${fcfa(montant)}`, `Numéro du bénéficiaire : ${numero}`]);

  async function ussd(texte) {
    const t = texte ? texte.split('*') : [];
    const [choix, numero, somme, decision, pin] = t;
    if (!t.length) return 'CON Bienvenue\n1. Consulter le solde\n2. Envoyer de l\'argent\n3. Historique des transactions\n4. Acheter du crédit';
    if (choix === '1') return `END Votre solde est de ${fcfa(await banque.solde())}`;
    if (choix === '3') {
      const lignes = (await banque.historique()).slice(0, 3).map((m) => `${jour(m.date).slice(0, 5)} ${m.type === 'recu' ? '+' : '-'}${fcfa(m.montant)}`);
      return `END Historique des transactions\n${lignes.join('\n')}`;
    }
    if (choix !== '2' && choix !== '4') return 'END Une erreur est survenue. Veuillez réessayer.';
    if (t.length === 1) return choix === '2' ? 'CON Numéro du bénéficiaire' : 'CON Numéro de téléphone';
    if (!telephoneValide(numero)) return 'END Numéro invalide';
    if (t.length === 2) return 'CON Montant';
    if (!montantValide(somme)) return 'END Montant invalide';
    const montant = Number(somme);
    const r = await recapitulatif(numero, montant);
    if (t.length === 3) {
      return choix === '2'
        ? `CON ${[...envoi(r, montant, numero), `Frais de l'opération : ${fcfa(r.frais)}`, `Total à débiter : ${fcfa(r.total)}`].join('\n')}\n1. Confirmer\n2. Annuler`
        : `CON Montant : ${fcfa(montant)}\nNuméro de téléphone : ${numero}\n1. Confirmer\n2. Annuler`;
    }
    if (decision === '2') return 'END Opération annulée. Aucun montant n\'a été débité.';
    if (decision !== '1') return 'END Une erreur est survenue. Veuillez réessayer.';
    if (t.length === 4) return 'CON Saisissez votre code PIN';
    if (pin !== PIN_ESSAI) return 'END Code PIN incorrect. Il vous reste 2 essais.';
    const resultat = choix === '2'
      ? await banque.transferer({ montant, telephone: numero, nom: r.nom, type: r.type })
      : await banque.acheterCredit({ montant, telephone: numero });
    if (!resultat.ok) return resultat.refus === 'solde_insuffisant' ? 'END Solde insuffisant' : 'END Une erreur est survenue. Veuillez réessayer.';
    return `END Opération réussie\nRéférence de l'opération : ${resultat.reference}`;
  }

  const json = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json; charset=utf-8' } });

  async function api(chemin, requete) {
    if (chemin === 'solde' && requete.method === 'GET') {
      const solde = await banque.solde();
      return json({ titre: 'Votre solde', message: `Votre solde est de ${fcfa(solde)}`, solde, devise: 'FCFA' });
    }
    if (chemin === 'historique' && requete.method === 'GET') {
      const operations = (await banque.historique()).slice(0, 5).map((m) => ({ date: m.date, libelle: LIBELLES[m.type], montant: m.montant, nom: m.nom }));
      return json({ titre: 'Historique des transactions', operations });
    }
    if (chemin === 'transfert' || chemin === 'transfert/confirmer') {
      const { telephone = '', montant = '', pin = '' } = await requete.json();
      if (!telephoneValide(String(telephone))) return json({ erreur: 'Numéro invalide' }, 400);
      if (!montantValide(String(montant))) return json({ erreur: 'Montant invalide' }, 400);
      const r = await recapitulatif(String(telephone), Number(montant));
      if (chemin === 'transfert') {
        const [message, beneficiaire] = envoi(r, Number(montant), String(telephone));
        return json({
          statut: 'recapitulatif', titre: 'Récapitulatif de l\'opération', message, ...(beneficiaire ? { beneficiaire } : {}),
          frais: `Frais de l'opération : ${fcfa(r.frais)}`, total: `Total à débiter : ${fcfa(r.total)}`, avertissement: 'Cette opération est irréversible',
          actions: ['Confirmer', 'Annuler'],
        });
      }
      if (String(pin) !== PIN_ESSAI) return json({ erreur: 'Code PIN incorrect. Il vous reste 2 essais.' }, 401);
      const resultat = await banque.transferer({ montant: Number(montant), telephone: String(telephone), nom: r.nom, type: r.type });
      if (!resultat.ok) return json({ erreur: resultat.refus === 'solde_insuffisant' ? 'Solde insuffisant' : 'Une erreur est survenue. Veuillez réessayer.' }, 400);
      return json({ statut: 'reussi', titre: 'Transfert effectué', message: 'Votre transfert a été envoyé avec succès.', reference: resultat.reference, detail: `Référence de l'opération : ${resultat.reference}` });
    }
    return json({ erreur: 'Adresse inconnue' }, 404);
  }

  return {
    banque,
    async traiter(requete) {
      const url = new URL(requete.url);
      if (url.pathname === '/ussd' && requete.method === 'POST') {
        const champs = new URLSearchParams(await requete.text());
        return new Response(await ussd(champs.get('text') || ''), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      const chemin = url.pathname.match(/^\/api\/(.+)$/);
      if (chemin) return api(chemin[1], requete);
      return new Response('Adresse inconnue', { status: 404 });
    },
  };
}
