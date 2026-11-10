# Mayem — règles de code

Mayem affiche un service financier web en bulu sans toucher au code du service.
Ce fichier fixe la façon d'écrire le code. Claude Code le lit au début de chaque session.

## Style
- TypeScript pour `core/` et `dom/`, sans framework. Uniquement des types effaçables (pas d'enum ni de namespace) :
  `tools/compile.js` les retire avec Node, sans compilateur installé. `tools/` et `test/` restent en JavaScript.
- Modules ES, une responsabilité par fichier. Aucune dépendance dans l'extension ;
  seule exception, Playwright pour les tests navigateur (`e2e/`) et l'inventaire (`tools/inventaire.js`),
  en `devDependencies`, jamais dans l'extension.
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
- Jamais de `innerHTML` sur la page : on ne change que la valeur des nœuds texte existants.
- Ne jamais lire ni modifier un champ de saisie.
- Aucune requête réseau, aucun stockage des textes affichés.
- Permissions minimales : `activeTab` et `scripting`, injection au clic sur l'icône (`dom/fond.ts`).
  Pas de `content_scripts` automatiques, pas de `web_accessible_resources`.
- Le script intégré (`dom/web.ts`, `dist-web/mayem.js`) suit les mêmes règles : packs embarqués et vérifiés,
  aucune requête réseau après son chargement, rien dans la page avant que le pack soit accepté.
- Montants, dates, numéros, références, noms : jamais traduits. Une sortie dont les chiffres diffèrent de l'entrée est rejetée.
- Jamais de phrase composée mot à mot : hors corpus, seul un libellé qui est un terme validé est traduit ;
  une phrase inconnue reste dans sa langue d'origine (étiquette et gloses en CSS).
- Seul le bulu validé par deux personnes s'affiche (`MODE_TEST` à `false` dans `dom/entree.ts` pour la démo).
- Aucune dépendance payante. Toute dépendance ajoutée est déclarée dans `THIRD_PARTY.md`.
- Données : © Équipe Mayem, tous droits réservés. Aucun nom de traducteur dans ce qui est distribué ou publié
  (dist/, dist-web/, api/, exports) : passer par `versPublic` (`tools/public.js`). Les noms restent internes.

## Avant chaque commit
- `npm test` passe.
- `npm run pack` passe (il lance check-pack).
- Si `core/` ou `dom/` change : `npm run test:navigateur` passe.
