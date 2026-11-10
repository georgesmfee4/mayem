# Réutiliser Mayem : données et moteur

Mayem sépare deux rôles :

```
Distribution des données (en ligne possible, publique, versionnée)
  packs/<langue>/  ──npm run api──►  api/index.json, api/packs/<langue>/<version>.json, api/exports/<langue>/…

Traduction (toujours sur l'appareil : aucun texte affiché ne quitte l'appareil)
  interface (extension, site, appli)  ──►  moteur (dist-lib/mayem-core.js)  ──►  pack local
```

Un service qui veut le bulu (ou toute autre langue de `packs/`) prend le pack et le moteur ; un outil
de traduction ou un grand moteur prend les exports. Personne ne réécrit rien.

## 1. Les données

### Pack (`pack.json`, contrat : `packs/schema.json`)

| Champ | Sens |
|---|---|
| `langue`, `nom` | Code ISO 639-3 (`bum`) et nom de la langue |
| `version`, `date` | Version sémantique : correction → `0.3.1`, phrase ou terme ajouté ou retiré → `0.4.0` |
| `empreinte` | `sha256-…` du pack sans ce champ (`empreinte()` ci-dessous) : vérifier avant usage |
| `phrases[]` | `id` stable (clé de traduction), `fr`, `en[]`, `bulu` (texte dans la langue du pack, nom historique), `critique`, `traduit_par`, `relu_par`, `retraduit_par`, `retraduction`, `valide` |
| `glossaire[]` | Terminologie : `ref`, `terme`, `sens`, `bulu`, `a_eviter`, `critique`, auteurs |

Règles garanties par `verifierPack` : mêmes champs `{…}` et mêmes chiffres en français et en bulu ;
une phrase `valide` a été traduite et relue par deux personnes différentes. **N'afficher que les phrases
`valide: true`.** Les champs `{amount}`, `{name}`… sont remplacés par les valeurs d'origine, jamais traduites.

`CHANGELOG.md` dans chaque dossier de langue liste les phrases et termes changés à chaque version.

### Exports (`npm run export -- <langue>`)

| Fichier | Format | Pour |
|---|---|---|
| `<langue>.tmx` | TMX 1.4, avec auteurs et retraduction en propriétés | Mémoires de traduction, entraînement de moteurs |
| `<langue>.xlf` | XLIFF 1.2, unités approuvées | Outils de traduction et chaînes de localisation |
| `glossaire.tbx` | TBX-Basic (ISO 30042) | Bases terminologiques |
| `i18next/fr.json`, `i18next/<langue>.json` | i18next v4, `{{champ}}` | Sites et applis web |
| `android/values/…`, `android/values-b+<langue>/strings.xml` | Ressources Android, `%1$s` | Applis Android |

Seules les phrases validées sortent. Licence des données : `packs/LICENCE.md` (CC BY 4.0 après accord des locuteurs).

### API statique (`npm run api`)

`api/` est un dossier de fichiers, à servir par n'importe quel hébergement statique gratuit :

```
api/index.json                       langues, versions, empreintes, licence, liens
api/schema.json                      contrat des packs
api/packs/<langue>/latest.json       dernière version
api/packs/<langue>/<version>.json    versions figées (citer une version précise)
api/exports/<langue>/…               formats standards
```

Un client télécharge `index.json`, choisit une langue et une version, télécharge le pack et
**recalcule son empreinte** avant de l'utiliser. La mise en ligne est une décision humaine : la licence
affichée reste « réservée » tant que tous les locuteurs nommés n'ont pas signé (`packs/<langue>/accords.json`).

## 2. Le moteur (`dist-lib/mayem-core.js`, construit par `npm run build`)

Module ES sans dépendance, pour navigateur, Node, React Native ou serveur. Fonctions pures : ni DOM, ni réseau.

```js
import { traduire, verifierPack, empreinte } from './mayem-core.js';

const pack = await (await fetch('packs/bum/latest.json')).json(); // ou un fichier embarqué
if (await empreinte(pack) !== pack.empreinte || verifierPack(pack, schema).length) throw new Error('pack refusé');

const r = traduire('Votre solde est de 25 000 FCFA', pack);
// { statut: 'ok', sortie: 'Mebal ya èn jôé: 25 000 FCFA', id: 'X08', critique: true, valeurs: ['25 000 FCFA'], categorie: null }
```

| Fonction | Rôle |
|---|---|
| `traduire(texte, pack, { test? })` | `null` si rien à traduire (vide, ou seulement des montants, dates…) ; sinon un résultat |
| `etiquette(categorie, pack)` | Étiquette validée d'un message inconnu (`securite`, `erreur`, `frais`, `info`) |
| `categoriser(texte)` | Catégorie d'un texte français ou anglais inconnu |
| `repartir(morceaux, sortie, valeurs)` | Répartit une traduction entre plusieurs nœuds de texte sans déplacer les valeurs |
| `verifierPack(pack, schema)` | Liste des erreurs ; vide = pack utilisable |
| `controler(pack)` | Points à faire relire (glossaire, cohérence, négations) ; indicatif |
| `empreinte(pack)` | `Promise<'sha256-…'>` |
| `queDesFaits(texte)`, `memesChiffres(a, b)` | Garde-fous : texte sans mots, chiffres et devises identiques |

Résultat de `traduire` :

| `statut` | Afficher |
|---|---|
| `ok` | `sortie` (bulu validé) |
| `test` | `sortie` en mode test seulement (bulu pas encore validé) |
| `non_verifie` | l'original ; `categorie` permet d'afficher l'étiquette validée |
| `rejete` | l'original : la sortie aurait changé un chiffre |

## Garanties d'une version à l'autre

- Les `id` de phrases et les `ref` du glossaire ne changent pas de sens ; une phrase retirée n'est pas réutilisée.
- Les fonctions ci-dessus gardent leur signature tant que le chiffre majeur de Mayem ne change pas.
- Un champ ajouté au pack est facultatif pour les lecteurs ; un champ retiré change le chiffre majeur.
