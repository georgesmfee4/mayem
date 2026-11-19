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

**Code et données : © Équipe Mayem, tous droits réservés** (`LICENSE`, `packs/LICENCE.md`). Tout usage se fait
dans le cadre d'un accord avec l'équipe Mayem : les fichiers officiels s'utilisent tels quels, sans modification.

## 1. Les données

### Pack (`pack.json`, contrat : `packs/schema.json`)

| Champ | Sens |
|---|---|
| `format` | `2`. Un lecteur doit refuser un format qu'il ne connaît pas (`verifierPack` le fait) |
| `langue`, `nom` | Code ISO 639-3 (`bum`), valable aussi comme étiquette BCP 47, et nom de la langue |
| `producteur`, `droits` | « Équipe Mayem », « Tous droits réservés » |
| `version`, `date` | Version sémantique : correction → `0.3.1`, phrase ou terme ajouté ou retiré → `0.4.0` |
| `empreinte` | `sha256-…` du pack sans ce champ (`empreinte()` ci-dessous) : vérifier avant usage |
| `phrases[]` | `id` stable (clé de traduction), `fr`, `en[]`, `cible` (texte dans la langue du pack, quelle qu'elle soit), `critique`, `traduit_par`, `relu_par`, `retraduit_par` (codes des relecteurs Mayem, jamais leurs noms), `retraduction`, `valide`, `variantes` (facultatif : autres formulations françaises vérifiées, qui mènent à la même traduction) |
| `glossaire[]` | Terminologie : `ref`, `terme`, `sens`, `cible`, `a_eviter`, `critique`, codes des relecteurs |

Règles garanties par `verifierPack` : mêmes champs `{…}` et mêmes chiffres en français et dans la traduction ;
une phrase `valide` a été traduite et relue par deux personnes différentes. **N'afficher que les phrases
`valide: true`.** Les champs `{amount}`, `{name}`… sont remplacés par les valeurs d'origine, jamais traduites.

`CHANGELOG.md` dans chaque dossier de langue liste les phrases et termes changés à chaque version.

Format 1 (versions publiées jusqu'à 0.5.3) : la traduction s'appelait `bulu`, et il n'y avait pas de champ `format`.
Ces versions restent publiées telles quelles ; le passage au format 2 (0.6.0) n'a changé aucune traduction.

### Exports (`npm run export -- <langue>`)

| Fichier | Format | Pour |
|---|---|---|
| `<langue>.tmx` | TMX 1.4, retraduction en propriété, mention des droits Mayem | Mémoires de traduction, entraînement de moteurs |
| `<langue>.xlf` | XLIFF 1.2, unités approuvées | Outils de traduction et chaînes de localisation |
| `glossaire.tbx` | TBX-Basic (ISO 30042) | Bases terminologiques |
| `i18next/fr.json`, `i18next/<langue>.json` | i18next v4, `{{champ}}` | Sites et applis web |
| `android/values/…`, `android/values-b+<langue>/strings.xml` | Ressources Android, `%1$s` | Applis Android |

Seules les phrases validées sortent. Chaque fichier porte la mention « © Équipe Mayem — Tous droits réservés ».

## Conditions d'utilisation
- Les données appartiennent à l'équipe Mayem, tous droits réservés (`packs/LICENCE.md`). Elles s'utilisent
  selon ces conditions et celles du contrat d'accès à l'API ; l'accès pourra devenir payant.
- Pas de copie, de revente, de redistribution ni d'entraînement d'un système de traduction sans accord écrit.
- Mention obligatoire : « Données linguistiques : Équipe Mayem ».
- Aucune donnée personnelle : chaque phrase est validée par deux relecteurs de l'équipe, désignés par des codes
  (`Mayem-1`…) ; leurs noms ne sont jamais fournis.

### API v1 (`npm run api`), contrat : `docs/openapi.json` (OpenAPI 3.1)

`api/` est un dossier de fichiers signés, à servir par un hébergement statique. L'API sert les intégrateurs
(script en une ligne, applis) et ceux qui réutilisent les données. **L'extension ne l'appelle pas**, et l'API
ne reçoit jamais rien des pages des usagers : la traduction reste sur l'appareil.

```
api/v1/index.json                          point d'entrée et liens
api/v1/langues.json                        langues et dernière version de chacune
api/v1/langues/<langue>.json               toutes les versions (empreinte, format, clé) et les exports
api/v1/packs/<langue>/<version>.json       version figée et signée : ne change jamais
api/v1/packs/<langue>/latest.json          la dernière, pour explorer
api/v1/script/index.json                   versions du script, packs embarqués, intégrité sha384
api/v1/script/<version>/mayem.js           le script, et signature.json à côté
api/v1/cles-publiques.json                 clés de l'équipe (active, retirée, révoquée)
api/v1/outils/mayem-verifier.mjs           outil de l'intégrateur, avec mayem-core.js
api/v1/exports/<langue>/…                  formats standards (clé d'accès, voir ci-dessous)
api/v1/schema.json, openapi.json           contrats
```

**Signature.** Chaque pack porte `signature: { cle, valeur }` : ECDSA P-256 (SHA-256) de son empreinte,
par la clé de l'équipe Mayem. L'empreinte prouve que rien n'a changé ; la signature, que le pack vient bien
de l'équipe : quiconque contrôle un serveur peut recalculer une empreinte, pas imiter la signature. Le script
est signé octet par octet (`signature.json`), avec son intégrité `sha384`.

```js
import { verifierSignature } from './mayem-core.js';
const cles = (await (await fetch('https://…/v1/cles-publiques.json')).json()).cles; // à épingler dans l'appli
const erreurs = await verifierSignature(pack, cles); // [] : intact et signé par l'équipe Mayem
```

Ou, au moment de construire son site ou son appli, sans écrire de code (Node 18+, aucune dépendance) :

```
node mayem-verifier.mjs https://…/v1/script/<version>/mayem.js --sortie public/mayem.js
node mayem-verifier.mjs https://…/v1/packs/bum/0.6.0.json --sortie src/packs/bum.json
```

Rien n'est écrit si l'empreinte, la signature ou l'intégrité ne correspond pas. Les clés de confiance sont
inscrites dans l'outil : comparer leur identifiant à celui que publie l'équipe avant le premier usage.

**Versions figées.** Republier garde les octets et la signature d'une version déjà publiée ; un contenu
différent sous un numéro déjà publié arrête la publication. Une clé « retiree » ne signe plus mais ses
signatures restent valables ; si une clé est « revoquee », le même contenu est signé de nouveau par la clé active.

**Clé de l'équipe.** `npm run cle` la crée une fois : la clé privée va dans `~/.mayem/`, jamais dans le dépôt
(à sauvegarder hors du poste) ; la clé publique entre dans `packs/cles.json`.

**Exports et jeux de données** : servis avec une clé d'accès par client, à envoyer dans l'en-tête
`X-Mayem-Cle`. Sans clé connue : 401.

### Mise en ligne (Cloudflare Workers, offre gratuite)

```
npm run api          prépare api/ (signé, versions figées, _headers)
npm run deployer     contrôle, envoie, puis sonde l'adresse publique
```

- **Hébergement** (`hebergement/`) : les fichiers de `api/` sont servis tels quels par Cloudflare. Le Worker
  (`hebergement/worker.js`) ne passe que devant les chemins qui ne sont pas explicitement publics
  (`run_worker_first` dans `wrangler.json`) : il décode le chemin (encodage, casse, `..`, `\`) et refuse
  tout export sans clé connue. Journaux de requêtes désactivés : on ne garde pas qui consulte l'API.
- **En-têtes** (`api/_headers`, écrit par `npm run api`) : `Access-Control-Allow-Origin: *`, sans quoi
  l'intégrité `sha384` du script ne peut pas être contrôlée chez un intégrateur ; une version figée se garde
  un an (`immutable`) ; `latest.json`, les index et les clés sont revalidés à chaque fois.
- **Avant d'envoyer**, `npm run deployer` vérifie les signatures de `api/`, l'absence de tout nom interne,
  que `api/` est à jour du pack, et que **chaque version déjà en ligne est identique octet pour octet** à
  celle de `api/`. Une signature ECDSA change à chaque calcul : sans ce contrôle, un `api/` perdu puis refait
  sur un autre poste changerait des versions publiées. Dans ce cas, `npm run deployer -- --recuperer` copie
  d'abord dans `api/` les versions en ligne, puis `npm run api` les garde telles quelles.
- **Après l'envoi**, il télécharge le pack depuis l'adresse publique, vérifie sa signature, et tente
  d'obtenir un export sans clé par neuf chemins détournés : un seul succès est une erreur.
- **Clés d'accès** : `npm run cle-acces -- <client>` crée une clé, affichée une seule fois ; seule son
  empreinte SHA-256 va dans l'espace KV de Cloudflare. `npm run cle-acces -- --retirer <empreinte>` la
  retire aussitôt, sans redéployer.
- **Outil** : wrangler, de Cloudflare, lancé par `npx` à une version épinglée (`tools/cloudflare.js`), hors
  de `package.json` et de l'extension. La connexion au compte (`npx wrangler login`) se fait par l'équipe.
- L'adresse publique est notée dans `hebergement/adresse.txt` au premier envoi :
  **https://mayem-api.mayem.workers.dev** (point d'entrée : `/v1/index.json`).

**Grands packs.** Le sens reconnu indexe ses phrases au premier texte inconnu : quelques millisecondes pour
une centaine de phrases, de l'ordre de la seconde pour 20 000. Au-delà de quelques milliers de phrases, cet
index sera précalculé à la fabrication du pack.

## 2. Intégrer Mayem dans un site, en une ligne (`dist-web/mayem.js`)

Pour un service autorisé par l'équipe Mayem qui veut proposer la langue à ses clients sans leur demander
d'installer d'extension. Le fichier s'utilise tel quel : le modifier rompt l'accord, et l'attribut `integrity`
empêche de toute façon le navigateur de l'exécuter.
`npm run build` produit le fichier et affiche sa valeur `integrity` :

```html
<script src="/js/mayem.js" integrity="sha384-…" data-langue="bum" defer></script>
```

- **Le service sert le fichier lui-même** (environ 200 Ko, 43 Ko compressé) ; les packs sont dedans. Une fois
  le script chargé : aucune requête réseau, aucun stockage, aucun texte de la page envoyé où que ce soit.
- **`integrity`** : le navigateur refuse d'exécuter un fichier modifié. En plus, Mayem revérifie le pack
  (règles et empreinte) avant de toucher la page ; un pack refusé laisse la page intacte (message en console).
- Page en **https** obligatoire (Web Crypto, pour l'empreinte).
- Mêmes garanties que l'extension : seules les traductions validées, montants et numéros jamais traduits,
  aucun champ de saisie lu, Shadow DOM ouverts suivis, textes ajoutés après le chargement traduits.

| Attribut | Effet |
|---|---|
| `data-langue="bum"` | Langue de départ (sinon la première embarquée) |
| `data-bouton="non"` | Pas de bouton Mayem : le service utilise son propre interrupteur |
| `data-auto="non"` | Ne démarre qu'à l'appel de `Mayem.demarrer()` |

| `window.Mayem` | Rôle |
|---|---|
| `demarrer()` | Traduit la page (si `data-auto="non"`) |
| `inverser()` | Traduction ⇄ original |
| `choisirLangue(code)` | Change de langue sans recharger |
| `langues()` | `[{ langue, nom }]` des langues embarquées |
| `etat()` | `{ actif, refus }` : `refus` donne la raison si le pack a été refusé |

Un pack refusé émet aussi l'événement `mayem-refus` sur `document` (`detail : { langue, raisons }`) :
le service peut afficher son propre message.

**Politique de sécurité (CSP)** : autoriser le script lui-même (`script-src` avec son origine ou son hash).
Le bouton de Mayem vit dans un Shadow DOM avec sa propre balise `<style>` : si `style-src` interdit le style
en ligne, utiliser `data-bouton="non"` et le bouton du service ; les marques de la page passent par une
feuille adoptée.

## 3. Le moteur (`dist-lib/mayem-core.js`, construit par `npm run build`)

Module ES sans dépendance, pour navigateur, Node, React Native ou serveur. Fonctions pures : ni DOM, ni réseau.
Réservé aux services autorisés par l'équipe Mayem, à utiliser sans modification.

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
| (dans `traduire`) | Une phrase de même sens qu'une phrase validée reçoit sa traduction (`sens: 'reconnu'`, `id` = la phrase validée) ; un libellé qui est un terme validé du glossaire est traduit (`id` = réf. du terme) ; une phrase inconnue rend `termes` : ses termes validés, sans traduire la phrase |
| `etiquette(categorie, pack)` | Étiquette validée d'un message inconnu (`securite`, `erreur`, `frais`, `info`) |
| `categoriser(texte)` | Catégorie d'un texte français ou anglais inconnu |
| `repartir(morceaux, sortie, valeurs)` | Répartit une traduction entre plusieurs nœuds de texte sans déplacer les valeurs |
| `verifierPack(pack, schema)` | Liste des erreurs ; vide = pack utilisable |
| `controler(pack)` | Points à faire relire (glossaire, cohérence, négations) ; indicatif |
| `empreinte(pack)` | `Promise<'sha256-…'>` |
| `traduireTerme(texte, pack)`, `termesConnus(texte, pack)` | Terme validé qui forme tout le texte ; termes validés reconnus dans un texte (casse, accents et pluriel ignorés) |
| `inventorier(textes, pack, releve?)` | Reprise (traduit, proche, partiel, absent), modèles manquants (faits masqués, regroupés, communs à plusieurs services d'abord), mots absents. `releve` : `{ services, intacts }` (service de chaque texte ; marques à ne pas envoyer aux locuteurs) |
| `masquerFaits(texte)` | « 5 000 FCFA à 690 12 34 56 » → « {amount} à {phone} » |
| `queDesFaits(texte)`, `memesChiffres(a, b)` | Garde-fous : texte sans mots, chiffres et devises identiques |

Résultat de `traduire` :

| `statut` | Afficher |
|---|---|
| `ok` | `sortie` (bulu validé) |
| `test` | `sortie` en mode test seulement (bulu pas encore validé) |
| `non_verifie` | l'original ; `categorie` permet d'afficher l'étiquette validée |
| `rejete` | l'original : la sortie aurait changé un chiffre |

`sens: 'reconnu'` : la phrase n'était pas mot pour mot dans le corpus, mais elle a exactement le sens de la phrase
validée `id` (mêmes mots porteurs de sens, même négation, même temps, même personne, même modalité, même sens de
l'argent, mêmes valeurs). Seule une traduction validée est affichée ; il est conseillé de le signaler à l'écran.

## Garanties d'une version à l'autre

- Les `id` de phrases et les `ref` du glossaire ne changent pas de sens ; une phrase retirée n'est pas réutilisée.
- Les fonctions ci-dessus gardent leur signature tant que le chiffre majeur de Mayem ne change pas.
- Un champ ajouté au pack est facultatif pour les lecteurs ; un champ retiré change le chiffre majeur.
