# Mayem, prototype v0.3

Mayem est une extension de navigateur (Manifest V3) qui affiche un service financier web dans une langue nationale
camerounaise choisie par l'utilisateur, **sans modifier le code source du service**. Langue prise en charge
aujourd'hui : le bulu. D'autres langues s'ajoutent sans toucher au code (voir « Ajouter une langue »).
Testée en direct le 7 novembre 2026 sur l'environnement officiel `https://safinum.cm/hackathon-test`.

## Résultats sur l'environnement officiel (mode test, avant validation des traductions)

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
tools/       build-pack, check-pack, compile, kit.py (tableurs pour les locuteurs), export, api, deployer
hebergement/ Worker et configuration Cloudflare de l'API en ligne
docs/        API.md (réutiliser les données et le moteur), demo.md (déroulé de la démo), boutique.md (dépôt sur la boutique Edge),
             confidentialite.html et demo.html (publiées avec l'API)
test/        tests node:test
e2e/         tests Playwright dans Chromium, extension chargée
fixtures/    pages d'essai
```

## Ajouter une langue
Aucune ligne de code : un dossier `packs/<code>/` (code ISO 639-3) suffit. `test/langue-essai.test.js` le prouve
avec une langue d'essai (`qaa`, code réservé à l'usage local) qui passe tous les outils.
- `infos.json` : `langue`, `nom` (il donne leurs en-têtes aux tableurs : « TRADUCTION EWONDO »), `producteur`,
  `droits`, `orthographe`, `etiquettes`. Facultatifs, choisis par les locuteurs dans leur charte :
  `ecriture` (code ISO 15924, `Latn`), `lettres_exclues`, `formes_adresse` (formes polies à garder cohérentes).
  Sans eux, ni l'alphabet ni les formes d'adresse ne sont contrôlés : aucune règle d'une autre langue n'est imposée.
- `corpus.csv` (colonne `cible`), `glossaire.csv`, `style.csv` (charte) : remplis par les tableurs de `tools/kit.py`.
- `npm run pack -- <code>` fabrique `pack.json` au format 2 (`packs/schema.json`), que l'extension, le script
  intégré et les exports lisent tels quels.

Aucune dépendance dans l'extension : Node 22 suffit (types retirés par Node lui-même, `node:test` pour les tests).
Seuls les tests navigateur utilisent Playwright (gratuit, `devDependencies`).
Le TypeScript se limite aux types « effaçables » (pas d'enum ni de namespace).

## Tester
1. `npm run build` prépare l'extension dans `dist/`, avec toutes les langues de `packs/`
   (`npm run build -- bum` pour n'en garder qu'une ; la première est celle proposée au clic).
   `bum` est le code international du bulu (ISO 639-3) : il nomme le dossier `packs/bum/` et l'attribut
   `lang="bum"` lu par les lecteurs d'écran. Partout où une personne lit, Mayem affiche le nom « Bulu ».
2. Chrome → `chrome://extensions` → « Mode développeur » → « Charger l'extension non empaquetée » → le dossier `dist/`.
   La fiche de l'extension affiche la version du pack embarqué, puis celle du programme : « Bulu 0.5.3 (extension 0.3.0) ».
   Après un nouveau `npm run build`, cliquer sur la flèche « Actualiser » de la fiche.
3. Ouvrir `https://safinum.cm/hackathon-test?jury=1`, puis **cliquer sur l'icône Mayem** (épinglez-la dans la barre
   d'outils). Rien ne se passe avant ce clic. Le parcours reste dans la même page : un clic suffit pour les étapes 1 à 5.
   Après un rechargement de la page, recliquer.
4. Un nouveau clic sur l'icône, ou le bouton en bas à gauche, bascule traduction ⇄ original ; le bouton « i » affiche
   les compteurs et le contrôle des chiffres. Avec plusieurs langues embarquées, une liste à côté du bouton
   change la langue de la page (et de ses cadres) sans la recharger.
5. Pages d'essai construites autrement, pour prouver l'indépendance : `python -m http.server 8000` à la racine,
   puis `http://127.0.0.1:8000/fixtures/<page>.html` et un clic sur l'icône.
   - `simple.html` : HTML simple ; `balises.html` : textes coupés par des balises, messages de plusieurs phrases ;
   - `react.html` : rendu par état à la React (nœuds recréés, valeurs mises à jour sur place), en anglais,
     montants au format anglais (`XAF 25,000.00`) ;
   - `iframe.html` : formulaire dans un cadre du même site ; `shadow.html` : composants à Shadow DOM, dont un ajouté plus tard.
6. Longueur des traductions : `npm run build:pseudo` prépare `dist-pseudo/`, une extension en pseudo-langue
   (`qps`) : chaque texte est 40 % plus long, porte des lettres accentuées des langues nationales (ô, é, ñ, ɔ, ŋ) et s'encadre de ⟦ ⟧.
   Un crochet de fin absent signale un texte coupé ; chaque traduction qui déborde de sa boîte est entourée
   en pointillés rouges, et le bouton « i » compte les débordements. Page d'essai : `fixtures/etroit.html`.
   Champs, montants et références ne changent pas : le pack pseudo passe les mêmes contrôles.
   Sur la page officielle, en 375 px comme en 1280 px, aucun débordement, même avec la pseudo-langue :
   la mise en page passe à la ligne.
7. Tests : `npm test` (tous les textes réels de la page, en français et en anglais, et les refus de check-pack).
8. Tests dans un vrai navigateur, extension chargée (une seule fois : `npm install`) : `npm run test:navigateur`.
   Sous Windows, Edge déjà installé sert de navigateur ; ailleurs, `npx playwright install chromium` (environ 150 Mo). Chaque page d'essai est vérifiée après le clic :
   traductions, nombres identiques avant et après, champs de saisie intacts, bascule, cadre, Shadow DOM, et refus
   d'un pack modifié. Playwright ne sait pas cliquer sur l'icône : les tests appellent la même fonction depuis le
   script de fond, avec une copie du manifeste qui autorise `127.0.0.1` (le vrai manifeste n'est pas touché).

## Noyau conversationnel (finale SAFINUM)
La finale demande plus qu'un affichage traduit : comprendre une demande (« Envoie 5 000 à Paul »), poser une question
s'il manque quelque chose, faire confirmer, exécuter, et rester cohérent sur chaque canal (application, web, USSD,
SMS, serveur vocal, guichet). Une seule intelligence pour tous les canaux :

- `core/comprendre.ts` : intention, montants (en chiffres ou en lettres, `core/nombres.ts`), numéros camerounais,
  contacts du carnet (homonymes compris), facture, période, négation et valeur écartée par une correction
  (« non, pas 5 000, 10 000 »). Chaque intention retenue dit pourquoi ; dans le doute, aucune n'est retenue.
- `core/operation.ts` : l'opération normalisée et son empreinte, la même sur tous les canaux.
- `service/conversation.ts` : le dialogue. Question si une valeur manque ou si deux contacts portent le même nom,
  récapitulatif (montant, bénéficiaire, frais, total) puis « oui » avant toute exécution, correction d'une seule
  valeur, refus expliqué (solde insuffisant, plafond), changement de langue sans rien perdre.
- `service/reponses.ts` : réponses tirées du tableur des locuteurs ; en langue nationale seulement si elles sont validées.
- `service/journal.ts` : une ligne par tour, aux colonnes du tableau de bord du jury.
- `service/banque.ts` : le contrat avec la banque, et une banque simulée aux données fictives (`service/banque-essai.json`),
  en attendant le bac à sable SAFINUM.

Commandes :
- `npm run scenarios` : les dix scénarios du jury, avec chaque réponse et sa ligne de journal.
- `npm run conversation` : converser dans le terminal (`journal` montre la dernière ligne ; `-- --canal ussd` pour l'étiquette du canal).
- `npm test` vérifie les scénarios, la confirmation obligatoire, la négation, l'empreinte identique entre canaux et les pannes.

### Tableurs de la finale remplis
`python3 tools/import_finale.py finale-*.xlsx` importe les tableurs reçus : réponses et menus au corpus (versions
USSD, SMS et voix dans `finale/variantes.csv`), demandes, mots du dialogue, nombres et explications rangés pour la
compréhension, test à l'aveugle rangé pour la mesure. Le rapport liste chaque refus à renvoyer aux locuteurs.
`npm run mesure` donne le taux d'intentions justes sur le test à l'aveugle (`-- --provisoire` compte aussi les lignes
pas encore signées, pour mesurer seulement).

### Brancher un service réel (MTN, Orange…)
`python3 tools/kit_service.py mtn-cm` produit `service-mtn-cm-<langue>.xlsx` : services (noms qui ne se traduisent
pas), codes USSD avec fiabilité et source, touches de chaque opération, écrans de l'USSD, de l'application, des SMS et
du serveur vocal, mots du métier, demandes à dire de cinq façons. L'équipe relève d'abord le texte exact des écrans et
vérifie les codes sur un vrai téléphone ; les locuteurs traduisent ensuite. Le socle (`flux/argent-mobile/`) est commun
à tous les services ; seul le dossier `profiles/<service>/` change. Retour : `python3 tools/import_finale.py <classeur>`
(écrans au corpus, mots au glossaire, demandes aux formulations, codes vérifiés et touches au profil, que la passerelle
lit : `npm run passerelle -- --profil profiles/mtn-cm.json`).

### Passerelle : la couche d'API branchée devant un service existant
`npm run passerelle` lance la passerelle (`service/passerelle.ts`) et, sans autre profil, la banque d'essai
(`fixtures/services/banque.js`) : tout tourne sur ce poste, avec un seul compte simulé pour tous les canaux.

- `POST /v1/ussd` : l'adresse à donner à l'opérateur USSD. En relais, chaque écran du service est traduit ligne à ligne
  et les chiffres passent tels quels ; une phrase (« envoie 5000 au 677 12 34 56 ») devient les touches que le service
  attend (raccourcis du profil). Sans service à relayer (`profiles/mayem-seul.json`), le noyau répond lui-même.
- `/v1/relais/api/<chemin>` : l'application mobile ou le site appellent leur API à travers la passerelle ; les réponses
  JSON reviennent traduites (en-tête `x-mayem-langue`, `fr` pour l'original), valeurs et références intactes.
- Langue : au premier appel USSD d'un numéro, l'écran « Choisissez votre langue » ; la langue est ensuite retrouvée
  pour ce numéro sur tous les canaux. Sous chaque menu, la ligne « 0. Langue » (dans la langue en cours) rouvre le
  choix et reprend l'écran quitté, sans que le service reçoive rien. Seule la langue est gardée, rattachée à
  l'empreinte du numéro (`service/preferences.ts`).
- `POST /v1/converser` (assistant), `POST /v1/traduire`, `GET /v1/journal`, `GET /sante`.
- Pages : `/tableau` (journal en direct aux colonnes du jury, même couleur pour une même empreinte),
  `/essai/telephone` (téléphone simple qui compose *123#), `/essai/application` (application mobile, `?canal=web`).
- Un profil (`profiles/*.json`) décrit le service : adresses de son API et de son USSD, clés protégées, raccourcis de
  touches par intention, écran de réussite, appels d'API qui portent une opération. Code PIN d'essai : 1234.

La même opération garde la même empreinte par l'USSD (phrase ou touches tapées à la main), l'application mobile et
l'assistant : `npm test` le vérifie.

Vocabulaire : `service/lexique-fr.json` pour le français (à faire relire par un francophone de l'équipe), les termes
validés du glossaire pour la langue nationale, puis les formulations du tableur des demandes
(`python3 tools/kit_finale.py`). Une réponse non encore validée dans la langue nationale reste en français.

## Faire valider les traductions d'une langue
Les noms de fichiers prennent le nom de la langue ; les exemples ci-dessous utilisent le bulu, seule langue prise en
charge aujourd'hui.

Une seule fois : `python -m pip install openpyxl` (lecture des tableurs, voir `THIRD_PARTY.md`).

1. `python tools/kit.py export` crée `kit-validation-<langue>.xlsx` (mode d'emploi inclus). L'envoyer aux locuteurs, en commençant par les lignes P1.
2. Fichier rempli reçu (le fermer dans Excel d'abord) : `npm run import -- fichier.xlsx`.
   - Les traductions vont dans `packs/<langue>/corpus.csv`, le glossaire dans `glossaire.csv`, puis le pack est reconstruit.
   - S'il y a plusieurs langues : `npm run import -- fichier.xlsx <langue>` (et `--langue <code>` pour `kit.py`).
   - Une ligne n'est validée que si « Traduit par » et « Relu par » portent deux noms différents.
   - Chaque traduction remplacée est affichée (ancien -> nouveau) : un tableur plus ancien que `corpus.csv`
     se voit tout de suite. Pour annuler : `git checkout packs/<langue>/`.
   - Une case vide du glossaire n'efface jamais un terme déjà traduit.
   - Les en-têtes du tableur peuvent être renommés (« TERME <LANGUE> APPROUVÉ » ou « TRADUCTION <LANGUE> »,
     « Choisi par » ou « Traduit par ») ; une colonne introuvable est signalée.
3. Le pack n'est écrit que s'il est valide. Sinon chaque problème est listé avec le français et la traduction concernés :
   champ manquant, champs `{…}` ou chiffres différents entre le français et la traduction, ligne validée sans relecteur
   (ou relue par son traducteur). L'ancien pack reste en place. Après une correction à la main : `npm run pack`.
   - Si le contenu a changé, la version augmente (correction : 0.3.0 -> 0.3.1 ; phrase ou terme ajouté
     ou retiré : -> 0.4.0), la version est archivée dans `packs/<langue>/versions/` et
     `packs/<langue>/CHANGELOG.md` liste les phrases et termes changés.
   - Le pack porte une empreinte SHA-256 (`core/empreinte.ts`) : toute modification après fabrication se voit.
   - Lexique relu reçu en JSON (format `mayem-lexique`) : `npm run lexique -- fichier.json [--retenir REF1,REF2]`.
     Seules les entrées « valide » signées de deux noms entrent : un terme dans le glossaire, une phrase complète
     dans le corpus. Rien n'est remplacé : un français déjà présent garde sa traduction, et l'entrée est signalée.
4. Retraduction : `python tools/kit.py retraduction` crée `retraduction-a-envoyer.xlsx` (traduction seule). Une troisième
   personne, qui n'a pas vu le français, le retraduit. Fichier reçu : `npm run import -- fichier.xlsx`.
   - Chaque phrase du pack garde `retraduit_par` et `retraduction`, à comparer au français.
   - Une retraduction faite sur une traduction qui a changé depuis est écartée, et la phrase est listée « à refaire ».
   - Une phrase retraduite par son propre traducteur est refusée.
5. Révision de fidélité : `npm run revision` liste tout ce qui peut faire perdre des points à un jury linguiste
   (son total s'affiche aussi après `npm run pack`) et écrit `packs/<langue>/revision.json`.
   - Bloquant : une même traduction pour des phrases différentes dont l'une est critique et l'autre non.
   - À revoir : sens confondus, même français traduit de plusieurs façons, collisions du glossaire (mots entiers),
     terme critique ou négation du glossaire absents, termes sans traduction, orthographe (majuscules,
     apostrophes, espaces, ponctuation, alphabet), forme de politesse, boutons de plus de 3 mots.
   - Ce sont des questions pour les locuteurs : un locuteur peut avoir raison contre le glossaire.
     `npm run pack -- --strict` refuse le pack tant qu'il reste un constat bloquant (version finale).
   - `python tools/kit.py revision` en fait `revision-<langue>.xlsx` : mode d'emploi, charte d'orthographe, sens à
     distinguer, phrases à revoir (P1 critiques d'abord), glossaire à compléter, récapitulatif. Les cases
     « TRADUCTION <LANGUE> » reprennent la traduction actuelle ; aucune traduction n'est proposée. `--precedent ancien.xlsx` recopie
     les réponses d'un ancien tableur de relecture, à confirmer.
   - Retour : `npm run import -- revision-<langue>.xlsx`. Ligne inchangée : la validation reste ; « garder » à deux
     noms est noté (`decisions.csv`) et n'est plus redemandé tant que cette traduction ne change pas ; traduction changée
     à deux noms différents : remplacée et validée ; à un seul nom : l'ancienne traduction reste affichée et la proposition attend
     (`en-attente.csv`) ; explication du type « … pour dire … », chiffre ou champ {…} changé, deux propositions
     différentes : refusé et listé. La charte va dans `style.csv`, les commentaires dans `commentaires.csv`.
     L'import reconstruit le pack puis affiche ce qui reste à revoir.
6. `npm run build` et recharger l'extension.
7. `MODE_TEST` est à `false` dans `dom/entree.ts` (démo et usage réel) : seules les traductions validées
   s'affichent. Pendant une campagne de traduction, le mettre à `true` montre « ‹…› + français » pour le reste.

## Garanties intégrées
- On ne modifie que la valeur des textes existants : jamais de HTML injecté, jamais de nœud ajouté dans la page (compatible Vue/React).
- Montants, dates, références, numéros de compte et de téléphone, codes d'erreur : jamais traduits.
- Une sortie dont les chiffres ou devises diffèrent de l'entrée est rejetée (original conservé).
- Pack vérifié à chaque clic, avant d'entrer dans la page, avec les mêmes règles que `check-pack`
  (`core/verifier.ts`) : un pack incohérent (champ manquant, chiffre ajouté) n'est pas chargé et la page reste intacte.
  Son empreinte SHA-256 est recalculée : un mot changé à la main dans `dist/`, même sans chiffre, est refusé aussi.
  Le refus se voit sur l'icône (badge rouge « ! », raison au survol) ; `npm run demo:refus` prépare des copies
  modifiées pour le montrer (`docs/demo.md`).
- Champs de saisie jamais lus ni modifiés ; aucune donnée collectée, stockée ou envoyée ; aucun appel réseau.
- Permissions minimales : `activeTab` et `scripting`. Mayem n'entre dans une page qu'au clic sur son icône, dans
  l'onglet en cours seulement ; aucun fichier de l'extension n'est exposé aux sites (rien qui permette de la détecter).
- Retour à l'original : la page redevient exactement celle du service, sans soulignement, étiquette, glose ni
  langue déclarée. Extension supprimée, désactivée ou rechargée : les pages déjà ouvertes font de même d'elles-mêmes
  en deux secondes au plus, bouton compris (`dom/entree.ts`).
- Texte resté dans sa langue : deux traits s'il n'a aucun mot connu, un seul si des mots sont glosés ; jamais de
  fond de couleur.
- Message de plusieurs phrases : traduit phrase par phrase seulement si chacune est connue ; sinon tout
  l'original reste. Rien n'est inventé.
- Sens reconnu (`core/sens.ts`) : une phrase française que le corpus n'a pas, mais qui dit exactement la même chose
  qu'une phrase validée (« Votre virement a bien été envoyé. » pour « Votre transfert a été envoyé avec succès. »),
  reçoit la traduction déjà validée de celle-ci. Les deux phrases doivent avoir la même forme canonique : mêmes mots
  porteurs de sens, une fois mis à part la casse, les accents, l'ordre, les mots outils, les accords, la politesse
  et les synonymes métier ; et les mêmes traits de sens : négation (comptée), temps (« débité » n'est pas
  « à débiter »), personne (« J'ai vérifié » n'est pas « Vérifiez », « Vous confirmez » n'est pas « Confirmez »),
  imparfait (« était prévue » n'est pas « est prévue »), modalité, sens de l'argent, valeurs.
  Un trait différent, deux traductions possibles, un mot seul ou un nom propre à placer : l'original reste.
  Le texte traduit ainsi est souligné d'un pointillé fin et compté à part dans le panneau.
  `npm run sens` mesure le jeu d'essai : 102 paraphrases sur 102 reconnues (dont 30 tenues à l'écart du pack), 4 151 pièges
  tirés des phrases, des paraphrases vérifiées et des messages types, 0 faux rapprochement.
- Paraphrases (`packs/<langue>/paraphrases.csv`) : autres formulations françaises d'une phrase, proposées puis
  vérifiées par un francophone de l'équipe qui ne les a pas proposées. Seules les vérifiées entrent dans le pack ;
  chacune couvre à son tour toutes ses écritures (majuscules, accents, ordre, synonymes).
  `python tools/kit.py paraphrases` crée `paraphrases-a-verifier.xlsx` (français seul : « même sens ? oui / non »
  et un nom) ; `npm run import` le relit : « oui » signé la fait entrer, « non » la retire.
- Texte coupé par des balises (`Votre solde est de <b>25 000 FCFA</b>`) : traduit comme un seul bloc, puis la traduction
  est rangée dans les nœuds texte existants ; montants et noms gardent leur texte exact. Si la traduction change l'ordre des
  valeurs, l'original reste.
- Contenu inédit : original conservé + étiquette de catégorie validée affichée en CSS, hors du texte de la page.
- Libellé court qui est un terme du glossaire relu par deux personnes (« Solde », « Annuler »,
  « Frais : 500 FCFA ») : traduit par ce terme, la valeur reste telle quelle (`core/termes.ts`).
- Phrase inconnue : jamais composée mot à mot (classes nominales, négation et tons la rendraient
  fausse). Elle reste en français ; ses termes validés sont donnés à côté, en CSS (en bulu : « solde : Mebal »),
  et peuvent être masqués depuis le panneau.
- Interface de l'extension dans un Shadow DOM séparé, utilisable au clavier.
- Shadow DOM ouverts parcourus et surveillés comme la page ; cadres du même site traduits, un seul bouton
  (celui de la page principale bascule aussi les cadres).
- Débordements surveillés : une traduction plus large que sa boîte est comptée dans le panneau (lecture des
  dimensions seulement) ; les tests navigateur vérifient en 375 px et 1280 px qu'aucun bouton critique n'est coupé.
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

## Couvrir un nouveau service sans repartir de zéro
1. `npm run inventaire -- https://service-de-test/page1 https://service-de-test/page2` (ou des fichiers `.html`).
   Un navigateur ouvre chaque page et relève les textes que Mayem verrait, cadres et Shadow DOM compris.
   - Reprise par page : textes déjà traduits, proches (même texte qu'une entrée validée, à un pluriel, un accent
     ou une ponctuation près : les locuteurs confirment au lieu de retraduire), partiels (termes connus) et nouveaux.
   - `packs/<langue>/a-traduire.csv` : les textes manquants, montants, dates, numéros et références remplacés
     par `{amount}`, `{date}`… Les textes qui ne diffèrent que par leurs valeurs deviennent un seul modèle,
     avec les termes du glossaire déjà connus. Plusieurs services à la fois : la colonne `services` compte ceux
     où le modèle apparaît, et le jargon commun vient en tête, à traduire une fois pour tous.
   - `--profil profiles/<service>.json` : `{ "ne_pas_traduire": ["Nom de marque", …] }`. Les marques et noms de
     produits du service sortent de l'inventaire et ne partent pas chez les locuteurs.
   - Les mots absents du corpus et du glossaire, à ajouter au glossaire en priorité.
2. `npm run inventaire -- … --ajouter` met ces modèles dans `corpus.csv`, sans traduction ;
   `python tools/kit.py export` les envoie aux locuteurs, puis `npm run import` comme d'habitude.
   Seul ce qui est nouveau part chez les locuteurs ; la validation par deux personnes ne change pas.
   - `--ajouter --etat proche` n'envoie que les textes proches d'une entrée validée : pluriels (« Comptes » pour
     « compte ») et variantes. C'est le moyen de traduire un pluriel : il devient une phrase du corpus, validée
     par deux personnes. Mayem n'affiche jamais le singulier à la place d'un pluriel ; en attendant, il le glose.
3. `npm run couverture` : la même mesure sur les pages d'essai, à suivre d'une version à l'autre.

L'inventaire est un outil de l'équipe, lancé sur des pages d'essai ou un compte de test : un nom de personne
ne se reconnaît pas sans risque et n'est donc pas masqué. Rien n'est collecté chez les utilisateurs.

## Réutiliser les données et le moteur
Deux rôles séparés (détails : `docs/API.md`) :
- **Distribution des données** : `npm run export -- <langue>` produit TMX, XLIFF, TBX, i18next et Android ;
  `npm run api` prépare l'API v1 dans `api/` : packs et script signés par l'équipe (ECDSA P-256), versions
  figées, clés publiques, outil de vérification pour l'intégrateur, contrat OpenAPI 3.1 (`docs/openapi.json`).
  La clé privée se crée une fois avec `npm run cle` et ne quitte jamais le poste de l'équipe. L'extension
  n'appelle pas l'API ; l'API ne reçoit rien des pages. `npm run deployer` la met en ligne (Cloudflare,
  offre gratuite) après contrôle des signatures et des versions déjà publiées ; les exports demandent une
  clé d'accès (`npm run cle-acces`).
- **Intégration en une ligne** : `dist-web/mayem.js`, à inclure par un service dans ses pages
  (`<script src="mayem.js" integrity="…" data-langue="bum" defer>`), sans extension côté client ; packs
  embarqués, mêmes garanties (page d'essai `fixtures/integre.html`, réglages dans `docs/API.md`).
- **Traduction** : toujours locale. `npm run build` produit aussi `dist-lib/mayem-core.js`, le moteur seul
  en module ES sans dépendance (site, appli, serveur). Aucun texte affiché ne quitte l'appareil.
- **Boutique des extensions** : `npm run boutique` contrôle l'extension (autorisations, `MODE_TEST`, icônes,
  aucun nom de traducteur) et prépare `boutique/mayem-<version>.zip`. Le dépôt sur Microsoft Edge Add-ons,
  pas à pas, avec les textes de la fiche : `docs/boutique.md`. L'API publie aussi la politique de
  confidentialité (`/confidentialite`) et une banque fictive pour essayer l'extension (`/demo`).

## Droits
- **Données linguistiques** (`packs/` et tout ce qui en est tiré) : © Équipe Mayem, tous droits réservés
  (`packs/LICENCE.md`). Elles s'utilisent selon les conditions de l'API Mayem, qui pourra devenir payante.
- **Traducteurs** : la double validation est un mécanisme interne. Leurs noms restent dans les fichiers de
  l'équipe et ne sortent jamais : extension, script intégré, API et exports reçoivent une version publique
  où chaque nom devient un code (`tools/public.js`), ce qui laisse vérifiable la règle des deux personnes.
- **Code** (moteur, extension, script intégré, outils) : © Équipe Mayem, tous droits réservés (`LICENSE`).
  Un service autorisé utilise les fichiers officiels sans les modifier, selon son accord avec l'équipe ;
  toute copie, modification ou redistribution demande un accord écrit.
