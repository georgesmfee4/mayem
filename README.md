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
core/        moteur pur en TypeScript : reçoit une chaîne et un pack, rend un résultat ; verifier.ts contrôle un pack
dom/         couche page : parcours du DOM, observateur, bouton (Shadow DOM) ; fond.ts injecte au clic
packs/       schema.json + un dossier par langue : packs/<code>/ (infos.json, corpus.csv, glossaire.csv,
             retraduction.csv, pack.json généré). Aucun outil ne connaît une langue par son nom.
tools/       build-pack, check-pack, compile, kit.py (tableurs pour les locuteurs), export, api
docs/        API.md (réutiliser les données et le moteur), accord des locuteurs
test/        tests node:test
e2e/         tests Playwright dans Chromium, extension chargée
fixtures/    pages d'essai
```

Aucune dépendance dans l'extension : Node 22 suffit (types retirés par Node lui-même, `node:test` pour les tests).
Seuls les tests navigateur utilisent Playwright (gratuit, `devDependencies`).
Le TypeScript se limite aux types « effaçables » (pas d'enum ni de namespace).

## Tester
1. `npm run build` prépare l'extension dans `dist/`, avec toutes les langues de `packs/`
   (`npm run build -- bum` pour n'en garder qu'une ; la première est celle proposée au clic).
2. Chrome → `chrome://extensions` → « Mode développeur » → « Charger l'extension non empaquetée » → le dossier `dist/`.
3. Ouvrir `https://safinum.cm/hackathon-test?jury=1`, puis **cliquer sur l'icône Mayem** (épinglez-la dans la barre
   d'outils). Rien ne se passe avant ce clic. Le parcours reste dans la même page : un clic suffit pour les étapes 1 à 5.
   Après un rechargement de la page, recliquer.
4. Un nouveau clic sur l'icône, ou le bouton en bas à gauche, bascule bulu ⇄ original ; le bouton « i » affiche
   les compteurs et le contrôle des chiffres. Avec plusieurs langues embarquées, une liste à côté du bouton
   change la langue de la page (et de ses cadres) sans la recharger.
5. Pages d'essai construites autrement, pour prouver l'indépendance : `python -m http.server 8000` à la racine,
   puis `http://127.0.0.1:8000/fixtures/<page>.html` et un clic sur l'icône.
   - `simple.html` : HTML simple ; `balises.html` : textes coupés par des balises, messages de plusieurs phrases ;
   - `react.html` : rendu par état à la React (nœuds recréés, valeurs mises à jour sur place), en anglais,
     montants au format anglais (`XAF 25,000.00`) ;
   - `iframe.html` : formulaire dans un cadre du même site ; `shadow.html` : composants à Shadow DOM, dont un ajouté plus tard.
6. Tests : `npm test` (tous les textes réels de la page, en français et en anglais, et les refus de check-pack).
7. Tests dans un vrai navigateur, extension chargée (une seule fois : `npm install`) : `npm run test:navigateur`.
   Sous Windows, Edge déjà installé sert de navigateur ; ailleurs, `npx playwright install chromium` (environ 150 Mo). Chaque page d'essai est vérifiée après le clic :
   traductions, nombres identiques avant et après, champs de saisie intacts, bascule, cadre, Shadow DOM, et refus
   d'un pack modifié. Playwright ne sait pas cliquer sur l'icône : les tests appellent la même fonction depuis le
   script de fond, avec une copie du manifeste qui autorise `127.0.0.1` (le vrai manifeste n'est pas touché).

## Faire valider le bulu
Une seule fois : `python -m pip install openpyxl` (lecture des tableurs, voir `THIRD_PARTY.md`).

1. `python tools/kit.py export` crée `kit-validation-bulu.xlsx` (mode d'emploi inclus). L'envoyer aux locuteurs, en commençant par les lignes P1.
2. Fichier rempli reçu (le fermer dans Excel d'abord) : `npm run import -- fichier.xlsx`.
   - Les traductions vont dans `packs/<langue>/corpus.csv`, le glossaire dans `glossaire.csv`, puis le pack est reconstruit.
   - S'il y a plusieurs langues : `npm run import -- fichier.xlsx <langue>` (et `--langue <code>` pour `kit.py`).
   - Une ligne n'est validée que si « Traduit par » et « Relu par » portent deux noms différents.
   - Chaque traduction bulu remplacée est affichée (ancien -> nouveau) : un tableur plus ancien que `corpus.csv`
     se voit tout de suite. Pour annuler : `git checkout packs/<langue>/`.
   - Une case vide du glossaire n'efface jamais un terme déjà traduit.
   - Les en-têtes du tableur peuvent être renommés (« TERME BULU APPROUVÉ » ou « TRADUCTION BULU »,
     « Choisi par » ou « Traduit par ») ; une colonne introuvable est signalée.
3. Le pack n'est écrit que s'il est valide. Sinon chaque problème est listé avec le français et le bulu concernés :
   champ manquant, champs `{…}` ou chiffres différents entre le français et le bulu, ligne validée sans relecteur
   (ou relue par son traducteur). L'ancien pack reste en place. Après une correction à la main : `npm run pack`.
   - Si le contenu a changé, la version augmente (correction : 0.3.0 -> 0.3.1 ; phrase ou terme ajouté
     ou retiré : -> 0.4.0), la version est archivée dans `packs/<langue>/versions/` et
     `packs/<langue>/CHANGELOG.md` liste les phrases et termes changés.
   - Le pack porte une empreinte SHA-256 (`core/empreinte.ts`) : toute modification après fabrication se voit.
4. Retraduction : `python tools/kit.py retraduction` crée `retraduction-a-envoyer.xlsx` (bulu seul). Une troisième
   personne, qui n'a pas vu le français, le retraduit. Fichier reçu : `npm run import -- fichier.xlsx`.
   - Chaque phrase du pack garde `retraduit_par` et `retraduction`, à comparer au français.
   - Une retraduction faite sur un bulu qui a changé depuis est écartée, et la phrase est listée « à refaire ».
   - Une phrase retraduite par son propre traducteur est refusée.
5. Contrôle des traductions validées : `npm run controle` (son total s'affiche aussi après `npm run pack` et l'import).
   - Terme critique du glossaire absent de la phrase (ex. « confirmer » sans « Ntiñ ») ;
   - cohérence : même bulu pour des sens différents, même français ou même terme traduit de deux façons ;
   - négation du français (ne… pas, jamais, aucun, personne, rien, plus, sans) sans la forme du glossaire.
   Ce sont des points à faire relire, pas des refus : un locuteur peut avoir raison contre le glossaire.
   Le bulu attendu vient du glossaire du pack ; le code ne contient que des règles du français.
6. `npm run build` et recharger l'extension.
7. Pour la démo finale : `MODE_TEST = false` dans `dom/entree.ts`. Seules les traductions validées s'affichent.

## Garanties intégrées
- On ne modifie que la valeur des textes existants : jamais de HTML injecté, jamais de nœud ajouté dans la page (compatible Vue/React).
- Montants, dates, références, numéros de compte et de téléphone, codes d'erreur : jamais traduits.
- Une sortie dont les chiffres ou devises diffèrent de l'entrée est rejetée (original conservé).
- Pack vérifié à chaque clic, avant d'entrer dans la page, avec les mêmes règles que `check-pack`
  (`core/verifier.ts`) : un pack incohérent (champ manquant, chiffre ajouté) n'est pas chargé et la page reste intacte.
  Son empreinte SHA-256 est recalculée : un mot changé à la main dans `dist/`, même sans chiffre, est refusé aussi.
- Champs de saisie jamais lus ni modifiés ; aucune donnée collectée, stockée ou envoyée ; aucun appel réseau.
- Permissions minimales : `activeTab` et `scripting`. Mayem n'entre dans une page qu'au clic sur son icône, dans
  l'onglet en cours seulement ; aucun fichier de l'extension n'est exposé aux sites (rien qui permette de la détecter).
- Message de plusieurs phrases : traduit phrase par phrase seulement si chacune est dans le corpus ; sinon tout
  l'original reste. Rien n'est inventé.
- Texte coupé par des balises (`Votre solde est de <b>25 000 FCFA</b>`) : traduit comme un seul bloc, puis le bulu est
  rangé dans les nœuds texte existants ; montants et noms gardent leur texte exact. Si le bulu change l'ordre des
  valeurs, l'original reste.
- Contenu inédit : original conservé + étiquette de catégorie validée affichée en CSS, hors du texte de la page.
- Libellé court qui est un terme du glossaire relu par deux personnes (« Solde », « Annuler »,
  « Frais : 500 FCFA ») : traduit par ce terme, la valeur reste telle quelle (`core/termes.ts`).
- Phrase inconnue : jamais composée mot à mot (classes nominales, négation et tons du bulu la rendraient
  fausse). Elle reste en français ; ses termes validés sont donnés à côté, en CSS (« solde : Mebal »),
  et peuvent être masqués depuis le panneau.
- Interface de l'extension dans un Shadow DOM séparé, utilisable au clavier.
- Shadow DOM ouverts parcourus et surveillés comme la page ; cadres du même site traduits, un seul bouton
  (celui de la page principale bascule aussi les cadres).
- Autant de langues que de dossiers dans `packs/` : seul le pack de la langue choisie est lu et vérifié
  (empreinte comprise) à chaque clic ou changement de langue. Le moteur range les modèles par premier mot
  et ne les compile qu'au besoin : 20 000 phrases, index et 2 000 recherches en moins de 0,2 s.

## Limites connues
- Texte coupé par des balises : traduit seulement si la phrase entière est dans le corpus (« Votre solde est de {amount} »).
- Le panneau jury est lui aussi traité quand ses textes figurent dans le corpus (sans effet sur les contrôles).
- Repli IA pour le contenu inédit : non branché (outils gratuits uniquement, à décider).
- Un iframe d'un autre site que l'onglet n'est pas traduit : le clic (`activeTab`) ne donne accès qu'au site de l'onglet.
- Un Shadow DOM fermé (`mode: 'closed'`) est inaccessible à toute extension : son texte reste en français.
- Les compteurs du bouton ne comptent que la page principale, pas les cadres.
- La langue choisie n'est pas mémorisée (aucun stockage) : chaque clic sur l'icône repart de la première langue.
- Le champ `bulu` du pack contient le texte dans la langue du pack, quelle qu'elle soit (nom historique, gardé
  pour ne pas casser le contrat de données).

## Couvrir un nouveau service sans repartir de zéro
1. `npm run inventaire -- https://service-de-test/page1 https://service-de-test/page2` (ou des fichiers `.html`).
   Un navigateur ouvre chaque page et relève les textes que Mayem verrait, cadres et Shadow DOM compris.
   - Couverture par page : textes traduits, partiels (termes connus) et absents.
   - `packs/<langue>/a-traduire.csv` : les textes manquants, montants, dates, numéros et références remplacés
     par `{amount}`, `{date}`… Les textes qui ne diffèrent que par leurs valeurs deviennent un seul modèle,
     classés par fréquence, avec les termes du glossaire déjà connus.
   - Les mots absents du corpus et du glossaire, à ajouter au glossaire en priorité.
2. `npm run inventaire -- … --ajouter` met ces modèles dans `corpus.csv`, sans traduction ;
   `python tools/kit.py export` les envoie aux locuteurs, puis `npm run import` comme d'habitude.
   Seul ce qui est nouveau part chez les locuteurs ; la validation par deux personnes ne change pas.
3. `npm run couverture` : la même mesure sur les pages d'essai, à suivre d'une version à l'autre.

L'inventaire est un outil de l'équipe, lancé sur des pages d'essai ou un compte de test : un nom de personne
ne se reconnaît pas sans risque et n'est donc pas masqué. Rien n'est collecté chez les utilisateurs.

## Réutiliser les données et le moteur
Deux rôles séparés (détails : `docs/API.md`) :
- **Distribution des données** : `npm run export -- <langue>` produit TMX, XLIFF, TBX, i18next et Android ;
  `npm run api` prépare `api/` (index, packs versionnés avec empreinte, exports), à servir par un
  hébergement statique gratuit. Rien n'est mis en ligne automatiquement.
- **Traduction** : toujours locale. `npm run build` produit aussi `dist-lib/mayem-core.js`, le moteur seul
  en module ES sans dépendance (site, appli, serveur). Aucun texte affiché ne quitte l'appareil.

## Licences
- Code : Apache 2.0 (`LICENSE`, `NOTICE`), qui protège aussi contre les revendications de brevets.
- Données linguistiques (`packs/`) : CC BY 4.0 prévue (`packs/LICENCE.md`), applicable une fois l'accord
  `docs/accord-locuteurs.md` signé par chaque locuteur nommé dans le pack. Rien n'est publié avant.
