# Dépendances tierces

L'extension elle-même n'a aucune dépendance : rien n'est chargé depuis Internet, rien de npm n'est embarqué.

| Outil | Licence | Coût | Utilisé par | Rôle |
|---|---|---|---|---|
| [openpyxl](https://openpyxl.readthedocs.io/) | MIT | gratuit | `tools/kit.py` (développement seulement) | Lire et écrire les tableurs envoyés aux locuteurs |
| [Playwright](https://playwright.dev/) (`@playwright/test`) ; Edge déjà installé sous Windows, sinon le Chromium de Playwright | Apache 2.0 (Chromium : BSD) | gratuit | `e2e/` (tests seulement, `devDependencies`) | Charger la vraie extension dans un navigateur et vérifier les pages d'essai |

Outils de développement, gratuits, non embarqués : Node.js 22 (compilation, tests), Python 3 (kit des locuteurs).
