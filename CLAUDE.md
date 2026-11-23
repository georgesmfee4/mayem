# Mayem, règles de code

Mayem affiche un service financier web dans une langue nationale camerounaise choisie, sans toucher au code du service.
Pour la finale SAFINUM, son noyau conversationnel (`service/`) comprend aussi les demandes des utilisateurs et y répond,
de la même façon sur chaque canal (application, web, USSD, SMS, serveur vocal, guichet).
Langue prise en charge aujourd'hui : le bulu.
Ce fichier fixe la façon d'écrire le code. Claude Code le lit au début de chaque session.

## Style
- TypeScript pour `core/`, `dom/` et `service/`, sans framework. Uniquement des types effaçables (pas d'enum ni de namespace) :
  `tools/compile.js` les retire avec Node, sans compilateur installé. `tools/` et `test/` restent en JavaScript.
- Modules ES, une responsabilité par fichier. Aucune dépendance dans l'extension ;
  seule exception, Playwright pour les tests navigateur (`e2e/`) et l'inventaire (`tools/inventaire.js`),
  en `devDependencies`, jamais dans l'extension. La mise en ligne de l'API passe par wrangler (Cloudflare),
  lancé par `npx` à la version épinglée dans `tools/cloudflare.js`, hors de `package.json`.
- Noms de variables et de fonctions en français, courts et parlants : `trouverMontants`, `traduire`, `queDesFaits`.
  Pas de jargon : `noeud` plutôt que `n`, `regles` plutôt que `registreHeuristique`.
- Fonctions courtes. Si une fonction ne tient pas sur un écran, la couper.
- Pas d'abstraction « au cas où » : pas de classe, de fabrique ou de configuration tant qu'un deuxième usage réel n'existe pas.
- Commentaires en français, rares, pour dire *pourquoi*, jamais pour répéter le code.
- Pas d'emoji, pas de bannières, pas de commentaires du type « Étape 1 : ».

## Indépendance vis-à-vis de la page de test
- Aucun nom de domaine, sélecteur CSS, classe ou texte propre à safinum.cm dans le code.
- Les phrases à traduire vivent dans le pack de langue (`packs/<langue>/`), jamais dans le code.
- Aucun code de langue (`bum`…) dans `core/`, `dom/` ni `tools/` : une langue = un dossier `packs/<code>/`.
  Seuls les tests du bulu nomment `bum`.
- Ce qui est propre à un service va dans un profil JSON optionnel (`profiles/`). Sans profil, tout doit fonctionner.
- Le moteur (`core/`) ne touche ni au DOM ni au réseau : il reçoit une chaîne, il rend un résultat.
- Chaque fonctionnalité est testée sur les pages d'essai de `fixtures/` (HTML simple, React, iframe, Shadow DOM), pas seulement sur la page officielle.

## Règles qui ne se discutent pas
Les règles sur la page (`innerHTML`, champs de saisie, réseau, stockage, permissions) valent pour l'extension et le
script intégré. Le noyau conversationnel a les siennes, aussi strictes (section suivante). Toutes les autres valent partout.
- Jamais de `innerHTML` sur la page : on ne change que la valeur des nœuds texte existants.
- Ne jamais lire ni modifier un champ de saisie.
- Aucune requête réseau, aucun stockage des textes affichés.
- Permissions minimales : `activeTab` et `scripting`, injection au clic sur l'icône (`dom/fond.ts`).
  Pas de `content_scripts` automatiques, pas de `web_accessible_resources`.
- Le script intégré (`dom/web.ts`, `dist-web/mayem.js`) suit les mêmes règles : packs embarqués et vérifiés,
  aucune requête réseau après son chargement, rien dans la page avant que le pack soit accepté.
- Montants, dates, numéros, références, noms : jamais traduits. Une sortie dont les chiffres diffèrent de l'entrée est rejetée.
- Jamais de phrase composée mot à mot. Hors corpus, deux cas seulement affichent une traduction, toujours une
  traduction déjà validée : une phrase de même sens qu'une phrase validée (sens reconnu, `core/sens.ts`, garde-fous
  de négation, temps, personne, modalité, sens de l'argent et valeurs), ou un libellé qui est un terme validé.
  Toute autre phrase reste dans sa langue d'origine (étiquette et gloses en CSS).
- Seule une traduction validée par deux personnes s'affiche (`MODE_TEST` à `false` dans `dom/entree.ts` pour la démo).
- Aucune dépendance payante. Toute dépendance ajoutée est déclarée dans `THIRD_PARTY.md`.
- La clé privée de signature ne va jamais dans le dépôt (`~/.mayem/`, `tools/signature.js`) ; seules les clés
  publiques y sont (`packs/cles.json`). Une version publiée sur l'API ne change jamais.
- Code et données : © Équipe Mayem, tous droits réservés (`LICENSE`), aucune licence libre. Aucun nom de traducteur dans ce qui est distribué ou publié
  (dist/, dist-web/, api/, exports) : passer par `versPublic` (`tools/public.js`). Les noms restent internes.

## Noyau conversationnel (`service/`)
- Il comprend une demande venue d'un canal, pose une question s'il le faut, fait confirmer, exécute auprès de la
  banque, répond et journalise. Les canaux ne font que transporter le texte (ou la touche) dans les deux sens.
- Comprendre (`core/comprendre.ts`, `core/nombres.ts`) et l'opération (`core/operation.ts`) restent dans `core/`,
  purs. `service/` orchestre ; c'est le seul endroit qui parle à la banque.
- Réseau : uniquement vers le service financier configuré (banque simulée `service/banque.ts`, puis le bac à sable
  SAFINUM). Jamais vers un tiers, jamais vers un service de traduction ou d'intelligence artificielle.
- Il ne reçoit que la demande que l'utilisateur lui adresse : il ne lit aucune page ni aucun champ.
- Jamais d'exécution sans un « oui » (ou la touche 1) donné juste après un récapitulatif qui redit montant,
  bénéficiaire, frais et total. L'opération exécutée est celle qui a été confirmée : même empreinte.
- Dans le doute, une question, jamais une supposition : intention faible ou hésitante, valeur manquante,
  contact homonyme, demande négative (« n'envoie pas » n'exécute rien).
- Une demande donne une seule opération, la même sur tous les canaux (`core/operation.ts`) ; son empreinte ne
  dépend ni du canal, ni de la langue, ni de l'heure. Changer de langue ne fait rien perdre de l'opération en cours.
- Réponses : modèles du tableur des locuteurs (`packs/<code>/finale/reponses.csv`), valeurs insérées par le code.
  En langue nationale, une réponse ne s'affiche traduite que si le moteur la reconnaît comme validée en entier et
  que chaque valeur reprise est une valeur insérée ; sinon elle reste en français. Jamais de mélange des deux.
- Vocabulaire de compréhension : des données, jamais dans le code. Français : `service/lexique-fr.json`, relu par
  un francophone de l'équipe. Langue nationale : termes validés du glossaire, puis formulations recueillies auprès
  des locuteurs (tableur des demandes), validées par deux personnes.
- Code PIN : jamais transmis au moteur de compréhension, jamais journalisé.
- Journal : une ligne par tour aux colonnes du tableau de bord du jury, dans l'environnement de test seulement ;
  ni code PIN ni nom de traducteur.
- Banque simulée : données fictives (`service/banque-essai.json`), aucune donnée réelle de client.
- Les dix scénarios du jury (`tools/scenarios.js`) sont des tests : ils passent à chaque commit.
- La passerelle (`service/passerelle.ts`, standards Request et Response) se branche devant un service existant sans le
  modifier. Elle ne relaie que vers le service décrit par son profil (`profiles/`) : brancher un service, c'est écrire
  un profil, pas du code.
- Ce que le service affiche (écran USSD, réponse JSON) n'est remplacé que par une traduction validée ; un écran USSD
  traduit plus long que 182 signes reste tel que le service l'a écrit. Les clés protégées du profil ne sont jamais traduites.
- Elle ne journalise jamais le corps d'une requête. D'un appel d'API, elle ne lit que le montant et le numéro, et
  seulement pour les appels déclarés au profil. La saisie qui suit un écran de code secret n'est ni comprise ni journalisée.
- Les services « existants » d'essai (`fixtures/services/`) n'ont que des données fictives ; ils servent aussi de
  démonstration de secours sans le bac à sable.

## Rédaction (documentation, fiches, pages publiées, messages aux locuteurs)
- Mayem traduit vers une langue nationale camerounaise choisie. Ne jamais écrire qu'il traduit « vers le bulu » ni
  « du français vers le bulu » : le bulu n'apparaît que dans la liste des langues prises en charge
  (« langue prise en charge aujourd'hui : le bulu ») ou dans un exemple présenté comme tel.
- Pas de tiret long (tiret cadratin ou demi-cadratin) : une virgule, deux-points, une parenthèse ou un point à la place.

## Avant chaque commit
- `npm test` passe.
- `npm run pack` passe (il lance check-pack).
- Si `core/` ou `dom/` change : `npm run test:navigateur` passe.
- Si `service/` ou le vocabulaire change : `npm run scenarios` montre des conversations justes (les tests les vérifient).
