# Mayem — prototype v0.3

Mayem est une extension de navigateur (Manifest V3) qui affiche un service financier web en bulu **sans modifier son code source**.
Testée en direct le 7 novembre 2026 sur l'environnement officiel `https://safinum.cm/hackathon-test`.

## Résultats sur l'environnement officiel (mode test, avant validation du bulu)

| Contrôle (outil du jury, `?jury=1`) | Résultat |
|---|---|
| Vérification d'intégrité, étapes Frais, Bénéficiaire, Récapitulatif | **intact** (aucun écart) |
| Montant modifié en direct par le jury (25 000 → 30 000 FCFA) | **intact**, traduction mise à jour sans rechargement |
| Alerte de sécurité déclenchée par le jury | titre et message traités, code `SECURITY_002` intact |
| Message inédit injecté par le jury | détecté sans rechargement ; original conservé, `150 FCFA` intact, étiquette « Alerte de sécurité » ajoutée |
| Bascule de la page en anglais | tous les textes traités depuis l'anglais |
| Couverture (récapitulatif) | 26/39 = 67 % ; les 13 textes restants sont des valeurs à ne **jamais** traduire (montants, noms, référence, n° de compte, marque) |

Non testé : l'étape 5 (reçu), car elle demande de cliquer « Confirmer le transfert ». Ses textes sont dans le corpus.

## Ce que révèle la page de test
- Application Vue (Inertia), sans iframe ni Shadow DOM, aucun marqueur de traduction fourni.
- Un **panneau jury caché** (`?jury=1`) : injection de contenu inédit, déclenchement d'erreurs, modification des montants,
  comparaison valeurs attendues / affichées / soumises (« intact » ou « compromis »), et **taux de couverture**.
- La comparaison lit le texte exact des éléments de valeur : toute modification d'un montant, d'un nom ou d'une référence
  donne « compromis ». Le moteur ne touche donc jamais un texte qui ne contient que des faits.
- Le barème du protocole en ligne diffère du PDF : fonctionnement 25, **fidélité des traductions 20**, sécurité 20,
  intégration 15, accessibilité 10, innovation 10. La qualité linguistique est vérifiée **en plus** des 100 points.

## Organisation

```
core/        moteur pur en TypeScript : reçoit une chaîne et un pack, rend un résultat
dom/         couche page : parcours du DOM, observateur, bouton (Shadow DOM)
packs/       schema.json + un dossier par langue (packs/bum/pack.json, généré)
tools/       build-pack, check-pack, compile, kit.py (tableurs pour les locuteurs)
test/        tests node:test
```

Aucune dépendance : Node 22 suffit (types retirés par Node lui-même, `node:test` pour les tests).
Le TypeScript se limite aux types « effaçables » (pas d'enum ni de namespace).

## Tester
1. `npm run build` prépare l'extension dans `dist/`.
2. Chrome → `chrome://extensions` → « Mode développeur » → « Charger l'extension non empaquetée » → le dossier `dist/`.
3. Ouvrir `https://safinum.cm/hackathon-test?jury=1`. Le panneau jury permet de rejouer tous les contrôles ci-dessus.
4. Le bouton en bas à gauche bascule bulu ⇄ original ; le bouton « i » affiche les compteurs et le contrôle des chiffres.
5. Hors ligne : `cd mock-bank && python3 -m http.server 8000` (page d'essai construite autrement, pour prouver l'indépendance).
6. Tests : `npm test` (tous les textes réels de la page, en français et en anglais, et les refus de check-pack).

## Faire valider le bulu
Une seule fois : `python -m pip install openpyxl` (lecture des tableurs, voir `THIRD_PARTY.md`).

1. `python tools/kit.py export` crée `kit-validation-bulu.xlsx` (mode d'emploi inclus). L'envoyer aux locuteurs, en commençant par les lignes P1.
2. Fichier rempli reçu (le fermer dans Excel d'abord) : `npm run import -- fichier.xlsx`.
   - Les traductions vont dans `corpus.csv`, le glossaire dans `glossaire.csv`, puis le pack est reconstruit.
   - Une ligne n'est validée que si « Traduit par » et « Relu par » portent deux noms différents.
   - Chaque traduction bulu remplacée est affichée (ancien -> nouveau) : un tableur plus ancien que `corpus.csv`
     se voit tout de suite. Pour annuler : `git checkout corpus.csv glossaire.csv`.
   - Une case vide du glossaire n'efface jamais un terme déjà traduit.
   - Les en-têtes du tableur peuvent être renommés (« TERME BULU APPROUVÉ » ou « TRADUCTION BULU »,
     « Choisi par » ou « Traduit par ») ; une colonne introuvable est signalée.
3. Le pack n'est écrit que s'il est valide. Sinon chaque problème est listé avec le français et le bulu concernés :
   champ manquant, champs `{…}` ou chiffres différents entre le français et le bulu, ligne validée sans relecteur
   (ou relue par son traducteur). L'ancien pack reste en place. Après une correction à la main : `npm run pack`.
4. Retraduction : `python tools/kit.py retraduction` crée `retraduction-a-envoyer.xlsx` (bulu seul). Une troisième
   personne, qui n'a pas vu le français, le retraduit. Fichier reçu : `npm run import -- fichier.xlsx`.
   - Chaque phrase du pack garde `retraduit_par` et `retraduction`, à comparer au français.
   - Une retraduction faite sur un bulu qui a changé depuis est écartée, et la phrase est listée « à refaire ».
   - Une phrase retraduite par son propre traducteur est refusée.
4. `npm run build` et recharger l'extension.
5. Pour la démo finale : `MODE_TEST = false` dans `dom/entree.ts`. Seules les traductions validées s'affichent.

## Garanties intégrées
- On ne modifie que la valeur des textes existants : jamais de HTML injecté, jamais de nœud ajouté dans la page (compatible Vue/React).
- Montants, dates, références, numéros de compte et de téléphone, codes d'erreur : jamais traduits.
- Une sortie dont les chiffres ou devises diffèrent de l'entrée est rejetée (original conservé).
- Champs de saisie jamais lus ni modifiés ; aucune donnée collectée, stockée ou envoyée ; aucun appel réseau.
- Contenu inédit : original conservé + étiquette de catégorie validée affichée en CSS, hors du texte de la page.
- Interface de l'extension dans un Shadow DOM séparé, utilisable au clavier.

## Limites connues
- Texte coupé par des balises (`Solde : <b>5 000 FCFA</b>`) : non géré (absent de la page officielle, à traiter pour d'autres services).
- Le panneau jury est lui aussi traité quand ses textes figurent dans le corpus (sans effet sur les contrôles).
- Repli IA pour le contenu inédit : non branché (outils gratuits uniquement, à décider).
- Le pack et les modules sont déclarés `web_accessible_resources` (nécessaire pour les charger depuis le content script) :
  une page peut donc détecter que l'extension est installée.
- `<all_urls>` dans le manifeste : à restreindre au clic (`activeTab`) pour la version finale.
