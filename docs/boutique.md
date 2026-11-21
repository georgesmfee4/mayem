# Publier Mayem sur la boutique Microsoft Edge

Ce guide accompagne, pas à pas, le dépôt de l'extension Mayem sur la boutique des extensions de Microsoft Edge
(Microsoft Edge Add-ons). Il s'adresse à quelqu'un qui ne l'a jamais fait. Le dépôt prend environ 30 minutes ;
Microsoft examine ensuite l'extension pendant quelques jours.

Les textes à coller dans le formulaire se trouvent à la fin du guide, prêts à l'emploi.

## En deux mots : ce qu'est Mayem

Mayem affiche les pages des services financiers en ligne (banque, paiement mobile, transfert d'argent) dans une
langue nationale camerounaise choisie par l'utilisateur. Un clic sur l'icône, et la page change de langue ; un autre
clic, et elle revient au texte d'origine. La traduction se fait sur l'appareil, sans connexion.

**Langue prise en charge aujourd'hui : le bulu.** D'autres langues nationales s'ajouteront sans changer le
programme : chaque nouvelle langue arrive par une simple mise à jour de l'extension.

---

## 1. Ce dont vous avez besoin

### Le compte développeur

Il faut être inscrit au programme Microsoft Edge du Centre des partenaires Microsoft. L'inscription est gratuite.
Pour Mayem, c'est fait : le compte est vérifié et le programme Microsoft Edge est enregistré.

- Se connecter : https://partner.microsoft.com/dashboard/microsoftedge/public/login
- Guide officiel de Microsoft : https://learn.microsoft.com/fr-fr/microsoft-edge/extensions/publish/publish-extension

### Les fichiers, rangés dans le dossier `boutique/`

Une seule commande, dans le dossier du projet, les fabrique (ou les refait après un changement) :

```
npm run boutique
```

Elle reconstruit l'extension, vérifie qu'elle respecte les règles décrites plus bas, puis prépare le fichier zip.
Au moindre problème, elle s'arrête et dit quoi corriger : rien n'est préparé à moitié.

| Fichier | À quoi il sert |
|---|---|
| `mayem-<version>.zip` | L'extension elle-même, à téléverser. |
| `logo-300.png` | Le logo de la fiche (300 × 300 pixels). |
| `vignette-440x280.png` | La petite image promotionnelle, facultative, qui rend la fiche plus attrayante. |
| `capture-1-un-clic.png` | Capture 1 (1280 × 800) : la même page avant et après le clic sur l'icône Mayem. |
| `capture-2-montants.png` | Capture 2 (1280 × 800) : les montants restent exactement les mêmes. |
| `capture-3-confidentialite.png` | Capture 3 (1280 × 800) : rien ne quitte l'appareil, le bouton « i » et le retour au texte d'origine. |

Les captures montrent **FauxBank**, une banque fictive créée pour les essais. Aucune vraie banque n'y apparaît.
La page qu'on y voit est la vraie extension en action sur la page de démonstration : rien n'y est retouché.

Les images sont rangées dans `icones/boutique/`, suivies par git. La commande les recopie dans `boutique/`, à côté du zip.

### D'où viennent les visuels

Le logo, les couleurs, les polices et les images de la fiche sont dessinés dans le fichier Figma
« Mayem, identité et boutique » : la page **Identité** porte le logo et les éléments réutilisables, la page
**Boutique** porte la vignette et les captures.

- **Le logo** : le M de Mayem, surmonté d'un accent doré. Il rappelle les accents qui marquent les tons dans
  l'écriture de nombreuses langues nationales camerounaises. En dessous de 48 pixels, le M reste seul, pour rester
  lisible dans la barre du navigateur (`icones/icone.svg` et `icones/icone-petite.svg`).
- **Les couleurs** : bleu-vert `#0F4C5C`, bleu profond `#0A3640`, or `#F2B705`, crème `#F6F1E7`, encre `#12262C`.
- **Les polices** : Bricolage Grotesque pour les titres, Manrope pour le texte. Toutes deux sont gratuites
  (licence Open Font) et ne servent qu'aux images : l'extension n'en embarque aucune.
- **Le motif** : l'accent du logo répété en rangées décalées, comme une vannerie, en très léger dans le fond.

### Trois adresses en ligne, déjà publiées

| Adresse | À quoi elle sert |
|---|---|
| https://mayem-api.mayem.workers.dev/confidentialite | La politique de confidentialité, que la boutique demande. |
| https://mayem-api.mayem.workers.dev/demo | Une page de démonstration (FauxBank) pour essayer l'extension. Utile aux relecteurs de Microsoft comme au jury. |
| https://mayem-api.mayem.workers.dev/ | Le site du projet. |

### Ce que `npm run boutique` vérifie avant de préparer le zip

- L'extension ne demande que deux autorisations, **activeTab** et **scripting**, et rien d'autre.
- Elle ne s'installe sur aucune page d'elle-même : elle n'agit qu'après un clic sur son icône.
- Le mode test est éteint (`MODE_TEST` à `false`) : seules les traductions validées par deux personnes s'affichent.
- Les icônes sont présentes.
- **Aucun nom de traducteur** ne figure dans les fichiers distribués.

---

## 2. Le dépôt, étape par étape

Les intitulés des boutons peuvent varier un peu selon la langue de l'interface et les mises à jour du site de
Microsoft ; l'ordre des étapes, lui, reste le même.

### Étape 1 : créer l'extension et envoyer le zip

1. Connectez-vous au Centre des partenaires.
2. Dans le menu, ouvrez **Microsoft Edge**, puis cliquez sur **Créer une extension** (« Create new extension »).
3. Faites glisser le fichier zip du dossier `boutique/` dans la zone prévue, ou cliquez pour le choisir.
4. Patientez quelques secondes : Microsoft lit le fichier et affiche le nom « Mayem » avec sa version. S'il signale
   une erreur, notez le message exact et n'allez pas plus loin : il faut d'abord la corriger.

### Étape 2 : la disponibilité, ou qui peut voir l'extension

Deux choix vous sont demandés.

- **La visibilité.**
  - *Publique* : chacun peut trouver Mayem en cherchant dans la boutique.
  - *Masquée* (« Hidden ») : l'extension n'apparaît pas dans les recherches ; seules les personnes qui ont le lien
    peuvent l'installer.

  **Conseil pour la finale : « Masquée ».** Vous donnez le lien au jury et gardez la main tant que les traductions
  continuent d'être relues. Le passage en « Publique » se fait plus tard, sans tout redéposer.

- **Les marchés**, c'est-à-dire les pays où l'extension est proposée. Le Cameroun au minimum ; rien n'empêche de
  cocher tous les pays, puisque la diaspora parle aussi les langues nationales.

### Étape 3 : les propriétés, ou la carte d'identité de l'extension

| Rubrique | Ce qu'il faut indiquer |
|---|---|
| Catégorie | **Accessibilité** : Mayem rend les services financiers accessibles dans une langue nationale. À défaut, Productivité. |
| Politique de confidentialité | Oui, l'extension en a une : https://mayem-api.mayem.workers.dev/confidentialite |
| Site web | https://mayem-api.mayem.workers.dev/ |
| Contact du support | Une adresse e-mail que vous consultez. **Elle sera visible du public** : préférez une adresse dédiée au projet à votre adresse personnelle. |
| Contenu réservé aux adultes | Non. |

### Étape 4 : la fiche dans la boutique, la page que voient les visiteurs

Choisissez la langue **Français**, puis remplissez :

1. **Description** : le texte « Description longue, en français » de la partie 5.
2. **Logo** : `boutique/logo-300.png`.
3. **Petite vignette promotionnelle** (facultative) : `boutique/vignette-440x280.png`.
4. **Captures d'écran** : `capture-1-un-clic.png`, `capture-2-montants.png`, puis `capture-3-confidentialite.png`,
   dans cet ordre.
5. **Termes de recherche** : ceux de la partie 5.

Pour une fiche en anglais en plus, destinée aux relecteurs et aux visiteurs étrangers, ajoutez la langue **English**
avec les textes anglais de la partie 5 et les mêmes images.

### Étape 5 : les notes pour la certification

Ce message s'adresse à la personne de Microsoft qui examine l'extension : il explique pourquoi Mayem demande ses
deux autorisations et comment l'essayer. Collez le texte « Notes pour la certification » de la partie 5. La version
anglaise est à privilégier, car les relecteurs lisent surtout l'anglais.

### Étape 6 : envoyer

Cliquez sur **Publier** (« Publish »). L'extension part en examen.

---

## 3. Après l'envoi

- **Combien de temps ?** Microsoft annonce jusqu'à 7 jours ouvrés ; c'est souvent plus rapide.
- **Où suivre l'avancement ?** Dans le Centre des partenaires, sur la page de l'extension Mayem : « En cours
  d'examen », puis « Dans la boutique » une fois publiée.
- **Si elle est acceptée** : la page de l'extension donne un lien de la forme
  `https://microsoftedge.microsoft.com/addons/detail/…`. C'est ce lien que l'on transmet au jury.
- **Si elle est refusée** : Microsoft en donne la raison dans un message. Les cas les plus courants, et la réponse :
  - *Description jugée trop vague* : celle de ce guide est déjà détaillée ; ajoutez ce que le message réclame.
  - *Autorisations mal expliquées* : vérifiez que les notes pour la certification ont bien été collées.
  - *Le relecteur n'a pas pu tester* : renvoyez-le vers la page de démonstration.

  Il suffit de corriger puis de renvoyer : rien à payer, rien à recommencer depuis le début.

### Pendant la finale, si l'examen n'est pas terminé

L'extension se charge aussi sans passer par la boutique, directement depuis le dossier du projet :

1. Ouvrez `edge://extensions` dans Microsoft Edge (ou `chrome://extensions` dans Chrome).
2. Activez le **Mode développeur**.
3. Cliquez sur **Charger l'extension décompressée** et choisissez le dossier `dist/` du projet.

L'icône Mayem apparaît alors dans la barre du navigateur, exactement comme si elle venait de la boutique.

---

## 4. Plus tard : publier une nouvelle version

À chaque correction ou ajout de traductions, à chaque nouvelle langue, ou quand le programme change :

1. Augmentez le numéro de version dans `manifest.json` **et** dans `package.json` (par exemple 0.3.1 devient 0.3.2).
   La boutique refuse un numéro déjà utilisé.
2. Lancez `npm run boutique` : un nouveau fichier zip apparaît dans `boutique/`.
3. Dans le Centre des partenaires, ouvrez l'extension Mayem, section **Packages**, et téléversez ce zip. La fiche,
   les images et les textes restent en place : rien à remplir de nouveau.
4. Envoyez. Après l'examen, les navigateurs des utilisateurs installent la nouvelle version d'eux-mêmes.

L'extension ne va jamais chercher de mise à jour sur Internet : c'est la boutique qui s'en occupe, comme pour toutes
les extensions. C'est ce qui permet à Mayem de fonctionner sans aucune connexion.

---

## 5. Les textes à copier

### Nom

```
Mayem
```

### Description courte (déjà inscrite dans l'extension)

```
Affiche les services financiers en ligne dans une langue nationale camerounaise, d'un clic. Rien ne quitte votre appareil.
```

### Description longue, en français

```
Mayem met vos services financiers en ligne dans votre langue.

Votre banque, votre service de paiement mobile ou de transfert d'argent s'affiche en français ? Un clic sur l'icône Mayem, et la page passe dans la langue nationale camerounaise que vous avez choisie : titres, boutons, messages, alertes de sécurité. Un second clic, et vous retrouvez le texte d'origine.

Langue disponible aujourd'hui : bulu. D'autres langues nationales sont en préparation ; elles arriveront par une simple mise à jour de l'extension.

Des traductions relues par des locuteurs
Chaque phrase est traduite par un locuteur de la langue, puis relue par une deuxième personne. Les plus importantes, celles qui parlent d'argent ou de sécurité, sont aussi relues à l'aveugle par une troisième personne, qui n'a pas vu le texte d'origine : on s'assure ainsi que le sens reste le même. Mayem n'affiche que ces traductions validées. Il ne fabrique jamais une phrase mot à mot : quand il ne connaît pas une phrase, il la laisse telle quelle plutôt que de risquer un contresens sur votre argent.

Vos chiffres ne bougent pas
Montants, dates, numéros de compte, références et noms restent exactement tels que votre service les affiche. Mayem vérifie chaque chiffre avant d'afficher une traduction.

Votre vie privée d'abord
• Tout se passe dans votre navigateur : aucune donnée ne quitte votre appareil.
• Aucune connexion à Internet : les traductions sont déjà dans l'extension.
• Mayem ne lit jamais ce que vous tapez : identifiant, mot de passe, code secret, montant.
• Ni stockage, ni suivi, ni publicité.
• Mayem n'agit que sur la page ouverte, et seulement quand vous cliquez sur son icône.

Rien n'est modifié sur le site lui-même : rechargez la page, et tout redevient comme avant.

Essayez sans risque sur notre banque fictive : https://mayem-api.mayem.workers.dev/demo
```

### Description longue, en anglais (facultative)

```
Mayem shows your online financial services in your language.

Banking, mobile money or money transfer pages in French? Click the Mayem icon and the page switches to the Cameroonian national language you have chosen: titles, buttons, messages and security alerts. Click again to return to the original text.

Language available today: Bulu. More national languages are on the way; each one arrives through a simple extension update.

Every sentence is translated by a native speaker and reviewed by a second person. The most important ones, about money or security, are also back-translated by a third person who never saw the original text. Mayem only shows these validated translations and never builds sentences word by word: an unknown sentence stays as it is.

Amounts, dates, account numbers, references and names are never changed. Mayem checks every figure before showing a translation.

Privacy first: everything happens in your browser. No network connection, no data collected or stored, no tracking, no ads. Mayem never reads what you type and acts only on the open page, when you click its icon.

Try it safely on our fictional bank: https://mayem-api.mayem.workers.dev/demo
```

### Termes de recherche

```
langues nationales, Cameroun, traduction, banque, mobile money, accessibilité, bulu
```

### Notes pour la certification, en anglais (à coller)

```
Mayem translates the visible text of financial web pages into a Cameroonian national language chosen by the user (available today: Bulu), entirely on the device.

Permissions:
- activeTab: the extension acts only on the current tab, and only after the user clicks the toolbar icon. It has no access to any page otherwise.
- scripting: after that click, it injects its content script into the current tab to replace visible text nodes with validated translations.

No host permissions, no content scripts declared in the manifest, no web-accessible resources. The extension makes no network requests: the translations are bundled in the package. It stores nothing and never reads form fields.

How to test:
1. Open https://mayem-api.mayem.workers.dev/demo (a fictional bank page made for testing; nothing is sent anywhere).
2. Click the Mayem icon in the toolbar.
3. The page text switches to the chosen language. Amounts stay unchanged. The button at the bottom left switches back to the original text; the "i" button shows what was translated.
4. Click "Envoyer de l'argent" to see the transfer form translated as well.

Privacy policy: https://mayem-api.mayem.workers.dev/confidentialite
```

### Notes pour la certification, en français (pour mémoire)

```
Mayem traduit le texte affiché des pages financières vers une langue nationale camerounaise choisie par l'utilisateur (disponible aujourd'hui : bulu), entièrement sur l'appareil.

Autorisations :
- activeTab : l'extension n'agit que sur l'onglet ouvert, et seulement après un clic sur son icône. Sans ce clic, elle n'a accès à aucune page.
- scripting : après ce clic, elle place la traduction sur la page en remplaçant les textes affichés par leur traduction validée.

Aucun accès à « tous les sites », aucun script automatique, aucune ressource accessible depuis le web. Aucune requête réseau : les traductions sont dans l'extension. Rien n'est stocké, et les champs de saisie ne sont jamais lus.

Pour essayer : ouvrir https://mayem-api.mayem.workers.dev/demo, cliquer sur l'icône Mayem, puis sur « Envoyer de l'argent ».
```
