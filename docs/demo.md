# Démo Mayem : déroulé et vérifications

## Avant (la veille, puis 10 minutes avant)
- [ ] `npm test`, `npm run pack`, `npm run test:navigateur` passent.
- [ ] `npm run build`, puis recharger l'extension `dist/` dans `chrome://extensions` ; icône épinglée.
- [ ] `npm run demo:refus`, et `dist-refus/mot-change/` chargée dans un second profil.
- [ ] `MODE_TEST = false` dans `dom/entree.ts` (le panneau n'affiche pas « Mode test »).
- [ ] Une fenêtre de navigation sans autre extension ; zoom à 100 %.
- [ ] Onglets prêts : la page de test officielle, `fixtures/react.html` et `fixtures/shadow.html`
      (`python -m http.server 8000` à la racine), `dist-pseudo/` chargée dans un second profil si besoin.

## Déroulé (environ 5 minutes)
| Temps | Montrer | Critère |
|---|---|---|
| 0:00 | Page officielle intacte, puis un clic sur l'icône : la page passe en bulu, montants et numéros identiques | Fonctionnement 25 |
| 0:45 | Bouton « i » : textes traduits, originaux conservés, chiffres vérifiés, débordements à 0 | Fidélité 20, Sécurité 20 |
| 1:15 | Bascule bulu ⇄ original (bouton ou nouveau clic) ; un champ de saisie reste intact | Sécurité 20 |
| 1:45 | Panneau jury : contenu inédit injecté -> original conservé, étiquette validée et termes critiques en glose ; jamais de phrase inventée | Fidélité 20 |
| 2:30 | `fixtures/react.html` (anglais, écrans recréés) et `shadow.html` : même extension, aucun réglage par site | Intégration 15 |
| 3:00 | `fixtures/integre.html` dans un profil sans extension : la même traduction, par une seule balise `<script>` | Intégration 15 |
| 3:15 | Second profil avec `dist-refus/mot-change/` : clic sur l'icône -> la page ne bouge pas, badge rouge « ! », raison au survol (« empreinte différente ») | Sécurité 20 |
| 3:45 | `docs/API.md` : packs versionnés, exports TMX/XLIFF/TBX/i18next/Android, moteur en bibliothèque, inventaire d'un nouveau service | Intégration 15, Innovation 10 |
| 4:30 | Navigation au clavier, `lang="bum"` sur les textes traduits, débordements surveillés en 375 px | Accessibilité 10 |

## Démonstration du refus (préparer la veille)
1. `npm run demo:refus` : un mot changé dans la traduction du bandeau (G01), chiffres et champs intacts.
2. Dans un second profil Chrome, charger `dist-refus/mot-change/` comme extension non empaquetée.
3. Page officielle, clic sur l'icône : rien ne change dans la page, badge rouge « ! » sur l'icône ; survoler l'icône.
4. Dire : « Un seul mot modifié, aucun chiffre touché : l'empreinte SHA-256 le voit, Mayem refuse d'entrer. »
5. Secours sans extension : `fixtures/integre-refus.html`, puis `Mayem.etat()` dans la console.

## Phrases à dire
- « Seul le bulu relu par deux locuteurs s'affiche ; le reste garde le français, signalé. »
- « Aucune donnée ne quitte l'appareil : pas de requête réseau, permissions `activeTab` et `scripting`. »
- « Un nouveau service : l'inventaire mesure la couverture et n'envoie aux locuteurs que ce qui manque. »

## Si quelque chose casse
- Rien ne se passe au clic : recharger la page, puis recliquer (l'accès ne vaut que pour l'onglet cliqué).
- Extension refusée : console du service worker (`chrome://extensions` -> « service worker ») ; un pack
  modifié est refusé exprès. Refaire `npm run build`.
