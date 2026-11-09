// Test du moteur sur TOUS les textes réels de la page de test (FR + EN) et sur des valeurs piégées.
require('../data/memory.js'); require('../src/protect.js'); require('../src/engine.js');
const S = globalThis.SAF;
let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('ÉCHEC :', msg); } };

const M = globalThis.SAFINUM_MEMORY.filter(e => e.id && !e.id.startsWith('X'));
// 1) chaque texte de la page (sans champ) est reconnu, en FR et en EN
for (const e of M) for (const src of [e.fr, ...e.en]) {
  if (/\{/.test(src)) continue;
  const r = S.translate(src);
  ok(r && r.status === 'test' && r.id === e.id, `non reconnu : "${src}" -> ${JSON.stringify(r)}`);
}
// 2) textes composés tels que la page les affiche
const live = [
  ['Bonjour, Amina', 'A02', ['Amina']],
  ['Hello, Amina', 'A02', ['Amina']],
  ['Numéro de compte : CM 001 2345 6789 01', 'A06', ['CM 001 2345 6789 01']],
  ['Account number: CM 001 2345 6789 01', 'A06', ['CM 001 2345 6789 01']],
  ['Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)', 'F07', ['1,5 %', '100 FCFA', '2 500 FCFA']],
  ['1.5% fee (min. 100 FCFA, max. 2,500 FCFA)', 'F07', ['1.5%', '100 FCFA', '2,500 FCFA']],
  ['Frais de 2 % (min. 200 FCFA, max. 5 000 FCFA)', 'F07', ['2 %', '200 FCFA', '5 000 FCFA']],
  ['Vous allez envoyer 10 000 FCFA à Jean-Paul Mbarga', 'X13', ['10 000 FCFA', 'Jean-Paul Mbarga']],
];
for (const [src, id, keep] of live) {
  const r = S.translate(src);
  ok(r && r.id === id && r.out, `composé non reconnu : "${src}" -> ${JSON.stringify(r)}`);
  if (r && r.out) for (const k of keep) ok(r.out.includes(k), `valeur perdue "${k}" dans "${r.out}"`);
}
// 3) faits seuls : jamais touchés (montants, dates, références, comptes, téléphones, codes d'erreur)
const facts = ['250 000 FCFA', '-12 500 FCFA', '+180 000 FCFA', '05 nov. 2026', 'Nov 5, 2026', 'Oct 31, 2026',
  'SAF-2026-K3P9QZ', 'SECURITY_002', 'CM 001 2345 6789 01', '+237 6 99 12 34 56', '25 000 FCFA', '2,500 FCFA', '0 FCFA'];
for (const f of facts) ok(S.translate(f) === null, `fait modifiable : "${f}" -> ${JSON.stringify(S.translate(f))}`);
// 4) noms et marques : pas traduits, pas signalés comme phrase
for (const n of ['Jean-Paul Mbarga', 'Amina Ngo Bell', 'Safinum Pay', 'EN', 'FR', 'Jury']) {
  const r = S.translate(n);
  ok(r === null || (!r.out && !r.category), `nom touché : "${n}" -> ${JSON.stringify(r)}`);
}
// 5) contenu inédit : original conservé + catégorie
const novel = [
  ['Les frais de transfert vers un autre opérateur passent à 150 FCFA à partir de lundi.', 'fees'],
  ['Attention : ne communiquez jamais votre code PIN, même à un agent.', 'security'],
  ['Le service sera en maintenance ce soir de 22 h à minuit.', 'info'],
  ['Transfer failed: the recipient account is invalid.', 'error'],
];
for (const [t, cat] of novel) {
  const r = S.translate(t);
  ok(r && r.status === 'unverified' && !r.out && r.category === cat, `inédit mal traité : "${t}" -> ${JSON.stringify(r)}`);
}
// 6) garde-fou : une traduction validée qui change un chiffre est rejetée
const e = globalThis.SAFINUM_MEMORY.find(x => x.id === 'X08');
e.validated = true; e.bu = 'BULU {amount}';
ok(S.translate('Votre solde est de 5 000 FCFA').out === 'BULU 5 000 FCFA', 'chemin validé');
console.log(fail ? `${fail} échec(s)` : 'Tous les tests passent');
process.exit(fail ? 1 : 0);
