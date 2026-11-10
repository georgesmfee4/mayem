# Mayem — règles de code

Mayem affiche un service financier web en bulu sans toucher au code du service.
Ce fichier fixe la façon d'écrire le code. Claude Code le lit au début de chaque session.

## Style
- TypeScript pour `core/` et `dom/`, sans framework. Uniquement des types effaçables (pas d'enum ni de namespace) :
  `tools/compile.js` les retire avec Node, sans compilateur installé. `tools/` et `test/` restent en JavaScript.
- Modules ES, une responsabilité par fichier. Aucune dépendance ajoutée.
- Noms de variables et de fonctions en français, courts et parlants : `trouverMontants`, `traduire`, `queDesFaits`.
  Pas de jargon : `noeud` plutôt que `n`, `regles` plutôt que `registreHeuristique`.
- Fonctions courtes. Si une fonction ne tient pas sur un écran, la couper.
- Pas d'abstraction « au cas où » : pas de classe, de fabrique ou de configuration tant qu'un deuxième usage réel n'existe pas.
- Commentaires en français, rares, pour dire *pourquoi*, jamais pour répéter le code.
- Pas d'emoji, pas de bannières, pas de commentaires du type « Étape 1 : ».

## Indépendance vis-à-vis de la page de test
- Aucun nom de domaine, sélecteur CSS, classe ou texte propre à safinum.cm dans le code.
- Les phrases à traduire vivent dans le pack de langue (`packs/<langue>/`), jamais dans le code.
- Ce qui est propre à un service va dans un profil JSON optionnel (`profiles/`). Sans profil, tout doit fonctionner.
- Le moteur (`core/`) ne touche ni au DOM ni au réseau : il reçoit une chaîne, il rend un résultat.
- Chaque fonctionnalité est testée sur les pages d'essai de `fixtures/` (HTML simple, React, iframe, Shadow DOM), pas seulement sur la page officielle.

## Règles qui ne se discutent pas
- Jamais de `innerHTML` sur la page : on ne change que la valeur des nœuds texte existants.
- Ne jamais lire ni modifier un champ de saisie.
- Aucune requête réseau, aucun stockage des textes affichés.
- Permissions minimales : `activeTab` et `scripting`, injection au clic sur l'icône (`dom/fond.ts`).
  Pas de `content_scripts` automatiques, pas de `web_accessible_resources`.
- Montants, dates, numéros, références, noms : jamais traduits. Une sortie dont les chiffres diffèrent de l'entrée est rejetée.
- Seul le bulu validé par deux personnes s'affiche (`MODE_TEST` à `false` dans `dom/entree.ts` pour la démo).
- Aucune dépendance payante. Toute dépendance ajoutée est déclarée dans `THIRD_PARTY.md`.

## Avant chaque commit
- `npm test` passe.
- `npm run pack` passe (il lance check-pack).
