# Dépendances tierces

L'extension elle-même n'a aucune dépendance : rien n'est chargé depuis Internet, rien de npm n'est embarqué.

| Outil | Licence | Coût | Utilisé par | Rôle |
|---|---|---|---|---|
| [openpyxl](https://openpyxl.readthedocs.io/) | MIT | gratuit | `tools/kit.py` (développement seulement) | Lire et écrire les tableurs envoyés aux locuteurs |
| [wrangler](https://developers.cloudflare.com/workers/wrangler/) (Cloudflare), version épinglée dans `tools/cloudflare.js` | MIT ou Apache 2.0 | gratuit (offre gratuite de Cloudflare Workers) | `tools/deployer.js`, `tools/cle-acces.js`, lancé par `npx`, hors de `package.json`, jamais dans l'extension | Mettre l'API en ligne et gérer les clés d'accès aux exports |
| [Playwright](https://playwright.dev/) (`@playwright/test`) ; Edge déjà installé sous Windows, sinon le Chromium de Playwright | Apache 2.0 (Chromium : BSD) | gratuit | `e2e/` (tests) et `tools/inventaire.js` (inventaire d'un service), `devDependencies`, jamais dans l'extension | Charger la vraie extension dans un navigateur et vérifier les pages d'essai |

Outils de développement, gratuits, non embarqués : Node.js 22 (compilation, tests), Python 3 (kit des locuteurs).

Visuels de la fiche de la boutique (`icones/boutique/`), dessinés dans Figma (offre gratuite) : polices
[Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) et [Manrope](https://fonts.google.com/specimen/Manrope),
licence Open Font, gratuites. Elles ne servent qu'aux images : ni l'extension ni le script intégré n'embarquent de police.
