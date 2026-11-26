// Une banque distante d'essai, au contrat de l'API bancaire du bac à sable de la finale tel que sa documentation le
// décrit : chemins, codes d'erreur et leur statut HTTP, grille de frais, plafond, opérations en attente qui ne
// débitent rien avant leur confirmation. Données fictives. Chaque appel est noté avec sa clé et l'identifiant du tour :
// les tests y lisent ce que le journal du jury verra. Les noms des champs des réponses sont ceux du profil
// (profiles/safinum.json), à vérifier sur le vrai bac à sable.

const PLAFOND = 500000;
const local = (numero) => String(numero || '').replace(/\D/g, '').slice(-9);

// Grille de la documentation : transfert par tranches, crédit gratuit, facture à 100 FCFA
export function fraisDe(type, montant) {
  if (type === 'airtime') return 0;
  if (type === 'bill') return 100;
  if (montant <= 5000) return 50;
  if (montant <= 25000) return 150;
  if (montant <= 100000) return 400;
  return Math.round(montant / 100);
}

const DONNEES = () => ({
  comptes: { '690000001': { holder: 'Awa Ndzana', balance: 85000, currency: 'XAF' } },
  beneficiaires: [
    { name: 'Paul Mbarga', phone: '237677123456' }, { name: 'Paul Essomba', phone: '237699112233' },
    { name: 'Pierre Owona', phone: '237678901234' }, { name: 'Marie Abena', phone: '237651234567' },
    { name: 'Jean Bekono', phone: '237691234567' }, { name: 'Marthe Ndzana', phone: '237655001122' },
  ],
  historique: [
    { id: 'TRX-0901', type: 'transfer', direction: 'in', amount: 15000, counterparty: 'Eric Ndzana', date: '2026-11-23T09:12:00Z' },
    { id: 'TRX-0900', type: 'transfer', direction: 'out', amount: 5000, counterparty: 'Paul Mbarga', date: '2026-11-22T17:40:00Z' },
    { id: 'TRX-0899', type: 'airtime', direction: 'out', amount: 1000, counterparty: '237690000001', date: '2026-11-21T08:05:00Z' },
  ],
});

export function banqueDistante({ cle = 'sbx_essai_fictive' } = {}) {
  const d = DONNEES();
  const appels = [];
  const operations = new Map();
  let numero = 0;

  const json = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json' } });
  const refus = (code, statut, extra = {}) => json({ error: { code, message: code, ...extra } }, statut);

  function verifier(type, from, to, amount) {
    if (!Number.isInteger(amount) || amount <= 0) return refus('INVALID_AMOUNT', 422);
    if (amount > PLAFOND) return refus('LIMIT_EXCEEDED', 422);
    const compte = d.comptes[local(from)];
    if (!compte) return refus('UNKNOWN_ACCOUNT', 404);
    if (type === 'transfer' && !d.beneficiaires.some((b) => local(b.phone) === local(to))) {
      const candidats = d.beneficiaires.filter((b) => b.name.toLowerCase().includes(String(to).toLowerCase()));
      return refus('UNKNOWN_BENEFICIARY', 404, candidats.length > 1 ? { candidates: candidats } : {});
    }
    if (amount + fraisDe(type, amount) > compte.balance) return refus('INSUFFICIENT_FUNDS', 422);
    return null;
  }

  const vue = (op) => ({ id: op.id, status: op.status, type: op.type, from: op.from, to: op.to, amount: op.amount, fee: op.fee, total: op.total });

  function operation(id, action, corps, trace) {
    const op = operations.get(id);
    if (!op) return refus('TX_NOT_FOUND', 404);
    if (op.status !== 'pending') return refus('TX_NOT_PENDING', 409);
    if (action === 'cancel') { op.status = 'cancelled'; return json(vue(op)); }
    if (action === 'update') {
      const amount = corps.amount ?? op.amount;
      const to = corps.to ?? op.to;
      const probleme = verifier(op.type, op.from, to, amount);
      if (probleme) return probleme;
      Object.assign(op, { amount, to, fee: fraisDe(op.type, amount), total: amount + fraisDe(op.type, amount) });
      return json(vue(op));
    }
    const compte = d.comptes[local(op.from)];
    if (op.total > compte.balance) return refus('INSUFFICIENT_FUNDS', 422);
    compte.balance -= op.total;
    Object.assign(op, { status: 'completed', confirmeeAvec: trace });
    return json({ ...vue(op), balance: compte.balance });
  }

  async function traiter(requete) {
    const url = new URL(requete.url);
    const chemin = url.pathname.replace(/^\/api\/v1\//, '');
    const trace = requete.headers.get('x-trace-id');
    appels.push({ methode: requete.method, chemin, trace, cle: requete.headers.get('x-team-key') === cle });
    if (requete.headers.get('x-team-key') !== cle) return refus('UNAUTHORIZED', 401);
    const corps = requete.method === 'POST' ? await requete.json().catch(() => ({})) : {};
    let m;
    if ((m = chemin.match(/^accounts\/(\d+)\/transactions$/))) {
      return json({ transactions: d.historique.slice(0, Math.min(50, Number(url.searchParams.get('limit') || 10))) });
    }
    if ((m = chemin.match(/^accounts\/(\d+)$/))) {
      const compte = d.comptes[local(m[1])];
      return compte ? json({ phone: `237${local(m[1])}`, ...compte }) : refus('UNKNOWN_ACCOUNT', 404);
    }
    if (chemin === 'beneficiaries') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      return json({ beneficiaries: d.beneficiaires.filter((b) => !q || b.name.toLowerCase().includes(q) || local(b.phone) === local(q)) });
    }
    if (chemin === 'fees') {
      const amount = Number(url.searchParams.get('amount'));
      if (!Number.isInteger(amount) || amount <= 0) return refus('INVALID_AMOUNT', 422);
      const type = url.searchParams.get('type') || 'transfer';
      return json({ type, amount, fee: fraisDe(type, amount), total: amount + fraisDe(type, amount) });
    }
    if (chemin === 'transactions' && requete.method === 'POST') {
      const { type, from, to, amount } = corps;
      const probleme = verifier(type, from, to, amount);
      if (probleme) return probleme;
      const op = { id: `TRX-${String(++numero).padStart(4, '0')}`, status: 'pending', type, from, to, amount, fee: fraisDe(type, amount), total: amount + fraisDe(type, amount), creeeAvec: trace };
      operations.set(op.id, op);
      return json(vue(op), 201);
    }
    if ((m = chemin.match(/^transactions\/([\w-]+)\/(update|confirm|cancel)$/)) && requete.method === 'POST') return operation(m[1], m[2], corps, trace);
    return refus('INVALID_REQUEST', 422);
  }

  return { traiter, appels, operations, solde: () => d.comptes['690000001'].balance };
}
