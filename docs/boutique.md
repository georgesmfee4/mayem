# Publier Mayem sur la boutique Microsoft Edge

Ce guide explique, pas à pas, comment déposer l'extension Mayem sur la boutique des extensions de Microsoft Edge
(Microsoft Edge Add-ons). Il est écrit pour quelqu'un qui ne l'a jamais fait. Comptez environ 30 minutes pour le
dépôt, puis quelques jours d'attente pendant que Microsoft examine l'extension.

Tous les textes à copier dans le formulaire sont à la fin de ce guide, prêts à l'emploi.

---

## 1. Ce dont vous avez besoin

### Le compte développeur

Vous devez être inscrit au programme Microsoft Edge sur le Centre des partenaires Microsoft. C'est gratuit.
Pour Mayem, c'est déjà fait : le compte est vérifié et le programme Microsoft Edge est enregistré.

- Se connecter : https://partner.microsoft.com/dashboard/microsoftedge/public/login
- Guide officiel de Microsoft : https://learn.microsoft.com/fr-fr/microsoft-edge/extensions/publish/publish-extension

### Les fichiers, tous dans le dossier `boutique/`

Pour les fabriquer (ou les refaire après un changement), une seule commande dans le dossier du projet :

```
npm run boutique
```

Elle reconstruit l'extension, vérifie qu'elle respecte les règles (voir plus bas), puis prépare le fichier zip.
Si quelque chose ne va pas, elle s'arrête et dit quoi corriger : rien n'est préparé à moitié.

| Fichier | À quoi il sert |
|---|---|
| `mayem-0.3.1.zip` | L'extension elle-même, à téléverser. Le numéro est celui de la version. |
| `logo-300.png` | Le logo de la fiche (300 × 300 pixels). |
| `vignette-440x280.png` | La petite image promotionnelle (facultative, mais elle rend la fiche plus attrayante). |
| `capture-1-avant-apres.png` | Capture d'écran : la même page avant et après un clic sur Mayem. |
| `capture-2-panneau.png` | Capture d'écran : la page en bulu, avec le petit panneau d'information ouvert. |

Les captures montrent **FauxBank**, une banque fictive inventée pour les essais. Aucune vraie banque n'y apparaît.

### Trois adresses en ligne, déjà publiées

| Adresse | À quoi elle sert |
|---|---|
| https://mayem-api.mayem.workers.dev/confidentialite | La politique de confidentialité, que la boutique demande. |
| https://mayem-api.mayem.workers.dev/demo | Une page de démonstration (FauxBank) où l'on peut essayer l'extension. Utile aux relecteurs de Microsoft et au jury. |
| https://mayem-api.mayem.workers.dev/ | Le site du projet. |

### Ce que `npm run boutique` vérifie avant de préparer le zip

- L'extension ne demande que deux autorisations : **activeTab** et **scripting**. Rien d'autre.
- Elle ne s'installe sur aucune page toute seule : elle n'agit qu'après un clic sur son icône.
- Le mode test est éteint (`MODE_TEST` à `false`) : seul le bulu validé par deux personnes s'affiche.
- Les icônes sont bien là.
- **Aucun nom de traducteur** n'apparaît dans les fichiers distribués.

---

## 2. Le dépôt, étape par étape

Les noms exacts des boutons peuvent changer un peu selon la langue et les mises à jour du site de Microsoft,
mais l'ordre reste le même.

### Étape 1 — Créer l'extension et envoyer le zip

1. Connectez-vous au Centre des partenaires.
2. Dans le menu, ouvrez **Microsoft Edge**, puis cliquez sur **Créer une extension** (« Create new extension »).
3. Faites glisser le fichier `boutique/mayem-0.3.1.zip` dans la zone prévue, ou cliquez pour le choisir.
4. Attendez quelques secondes : Microsoft lit le fichier et affiche le nom « Mayem » et la version.
   S'il signale une erreur, notez le message exact et ne remplissez pas la suite : il faut d'abord corriger.

### Étape 2 — Disponibilité : qui peut voir l'extension

On vous demande deux choses.

- **La visibilité.**
  - *Publique* : tout le monde peut trouver Mayem en cherchant dans la boutique.
  - *Masquée* (« Hidden ») : l'extension n'apparaît pas dans les recherches. Seules les personnes à qui vous
    donnez le lien peuvent l'installer.

  **Conseil pour la finale : choisissez « Masquée ».** Vous donnerez le lien au jury, et vous garderez la main
  tant que le bulu continue d'être relu. Vous pourrez passer en « Publique » plus tard, sans tout redéposer.

- **Les marchés** (les pays où l'extension est proposée). Le Cameroun au minimum. Rien n'empêche de cocher
  tous les pays : la diaspora parle bulu aussi.

### Étape 3 — Propriétés : la carte d'identité de l'extension

| Rubrique | Ce qu'il faut mettre |
|---|---|
| Catégorie | **Accessibilité** (Mayem rend les services financiers accessibles dans une langue locale). À défaut : Productivité. |
| Politique de confidentialité | Oui, l'extension en a une : https://mayem-api.mayem.workers.dev/confidentialite |
| Site web | https://mayem-api.mayem.workers.dev/ |
| Contact du support | Une adresse e-mail que vous consultez. **Elle sera visible du public** : prévoyez une adresse dédiée au projet plutôt que votre adresse personnelle. |
| Contenu réservé aux adultes | Non. |

### Étape 4 — La fiche dans la boutique (la page que voient les gens)

Choisissez la langue **Français**. Puis remplissez :

1. **Description** : copiez le texte « Description longue » de la partie 3.
2. **Logo** : `boutique/logo-300.png`.
3. **Petite vignette promotionnelle** (facultative) : `boutique/vignette-440x280.png`.
4. **Captures d'écran** : `capture-1-avant-apres.png`, puis `capture-2-panneau.png`, dans cet ordre.
5. **Termes de recherche** : copiez ceux de la partie 3.

Si vous voulez aussi une fiche en anglais (pour les relecteurs et les visiteurs étrangers), ajoutez la langue
**English** et utilisez les textes anglais de la partie 3, avec les mêmes images.

### Étape 5 — Notes pour la certification

C'est un message pour la personne de Microsoft qui va examiner l'extension. Il lui explique pourquoi Mayem
demande ses autorisations et comment l'essayer. Copiez le texte « Notes pour la certification » de la partie 3.
Une version anglaise est fournie, car les relecteurs lisent surtout l'anglais.

### Étape 6 — Envoyer

Cliquez sur **Publier** (« Publish »). L'extension passe en examen.

---

## 3. Après l'envoi

- **Combien de temps ?** Microsoft annonce jusqu'à 7 jours ouvrés. Souvent, c'est plus rapide.
- **Où voir où ça en est ?** Dans le Centre des partenaires, sur la page de l'extension Mayem : « En cours
  d'examen », puis « Dans la boutique » quand c'est publié.
- **Si c'est accepté** : la page de l'extension donne un lien du type
  `https://microsoftedge.microsoft.com/addons/detail/…`. C'est ce lien qu'on donne au jury.
- **Si c'est refusé** : Microsoft explique pourquoi dans un message. Les raisons les plus courantes, et quoi faire :
  - *Description trop vague* : la description longue de ce guide est déjà détaillée ; ajoutez ce que le message demande.
  - *Autorisations mal expliquées* : vérifiez que les notes pour la certification ont bien été collées.
  - *Le relecteur n'a pas pu tester* : renvoyez-le vers la page de démonstration.

  Corrigez, puis renvoyez : il n'y a rien à payer ni à recommencer depuis le début.

### Pendant la finale, si l'examen n'est pas fini

L'extension se charge aussi sans la boutique, directement depuis le dossier du projet :

1. Ouvrez `edge://extensions` dans Microsoft Edge (ou `chrome://extensions` dans Chrome).
2. Activez le **Mode développeur**.
3. Cliquez sur **Charger l'extension décompressée** et choisissez le dossier `dist/` du projet.

L'icône Mayem apparaît dans la barre du navigateur, comme si elle venait de la boutique.

---

## 4. Plus tard : publier une nouvelle version

Chaque fois que les locuteurs corrigent ou ajoutent du bulu, ou que le programme change :

1. Augmentez le numéro de version dans `manifest.json` **et** dans `package.json` (par exemple 0.3.1 → 0.3.2).
   La boutique refuse un numéro déjà utilisé.
2. Lancez `npm run boutique`. Un nouveau fichier `boutique/mayem-0.3.2.zip` apparaît.
3. Dans le Centre des partenaires, ouvrez l'extension Mayem, section **Packages**, et téléversez le nouveau zip.
   La fiche, les images et les textes restent ceux d'avant : inutile de les remplir de nouveau.
4. Envoyez. Après l'examen, les navigateurs des utilisateurs installent la nouvelle version tout seuls.

L'extension elle-même ne va jamais chercher de mise à jour sur Internet : c'est la boutique qui s'en charge,
comme pour toutes les extensions. C'est pour cela que Mayem n'a besoin d'aucune connexion.

---

## 5. Les textes à copier

### Nom

```
Mayem
```

### Description courte (déjà dans l'extension)

```
Affiche en bulu les pages des services financiers en ligne, d'un clic. Rien ne quitte votre appareil.
```

### Description longue — en français

```
Mayem affiche en bulu les pages des services financiers en ligne : banque, paiement mobile, transfert d'argent.

Comment ça marche ?
Vous êtes sur la page de votre service, en français. Vous cliquez sur l'icône Mayem dans la barre de votre navigateur. Le texte de la page s'affiche aussitôt en bulu : les titres, les boutons, les messages, les alertes de sécurité. Un bouton « Bulu ⇄ original » vous permet de revenir au français à tout moment, et un petit panneau vous indique ce qui a été traduit.

Des traductions fiables, relues par des locuteurs
Chaque phrase en bulu a été traduite par un locuteur, puis relue par une deuxième personne. Les phrases les plus importantes ont aussi été relues par une troisième personne, qui n'avait pas vu le texte français, pour vérifier que le sens est bien le même. Seul ce bulu validé s'affiche. Mayem ne fabrique jamais une phrase mot à mot : quand il ne connaît pas une phrase, il la laisse en français plutôt que de risquer une erreur.

Vos chiffres ne changent jamais
Les montants, les dates, les numéros de compte, les références et les noms restent exactement tels que votre service les affiche. Mayem vérifie lui-même que chaque chiffre est intact avant d'afficher une traduction.

Votre vie privée est respectée
- Rien ne quitte votre appareil : la traduction se fait dans votre navigateur.
- Aucune connexion à Internet : le dictionnaire bulu est déjà dans l'extension.
- Mayem ne lit jamais ce que vous tapez (identifiant, mot de passe, code secret, montant).
- Aucun stockage, aucun suivi, aucune publicité.
- Mayem n'agit que sur la page ouverte, et seulement quand vous cliquez sur son icône.

Rien n'est modifié sur le site lui-même : rechargez la page et tout redevient comme avant.

Essayez sans risque sur notre banque fictive : https://mayem-api.mayem.workers.dev/demo
```

### Description longue — en anglais (facultative)

```
Mayem displays online financial services — banking, mobile money, money transfers — in Bulu, a language spoken in Cameroon.

Open your service's page in French, click the Mayem icon, and the page text appears in Bulu: titles, buttons, messages and security alerts. A "Bulu ⇄ original" button switches back to French at any time.

Every Bulu sentence was translated by a native speaker and reviewed by a second person; the most important ones were also back-translated by a third person who never saw the French text. Only this validated Bulu is shown. Mayem never builds sentences word by word: an unknown sentence stays in French.

Amounts, dates, account numbers, references and names are never changed. Mayem checks that every figure is identical before showing a translation.

Privacy: everything happens in your browser. No network connection, no data collected or stored, no tracking. Mayem never reads what you type, and acts only on the open page when you click its icon.

Try it safely on our fictional bank: https://mayem-api.mayem.workers.dev/demo
```

### Termes de recherche

```
bulu, traduction, banque, mobile money, Cameroun, langue locale, accessibilité
```

### Notes pour la certification — en anglais (à coller)

```
Mayem translates the visible text of financial web pages from French into Bulu (a language of Cameroon), entirely on the device.

Permissions:
- activeTab: the extension acts only on the current tab, and only after the user clicks the toolbar icon. It has no access to any page otherwise.
- scripting: after that click, it injects its content script into the current tab to replace visible text nodes with validated Bulu translations.

No host permissions, no content scripts declared in the manifest, no web-accessible resources. The extension makes no network requests: the Bulu dictionary is bundled in the package. It stores nothing and never reads form fields.

How to test:
1. Open https://mayem-api.mayem.workers.dev/demo (a fictional bank page made for testing; nothing is sent anywhere).
2. Click the Mayem icon in the toolbar.
3. The page text switches to Bulu. Amounts stay unchanged. Use the "Bulu ⇄ original" button (bottom left) to switch back, and the "i" button to see what was translated.
4. Click "Envoyer de l'argent" to see the transfer form translated as well.

Privacy policy: https://mayem-api.mayem.workers.dev/confidentialite
```

### Notes pour la certification — en français (pour mémoire)

```
Mayem traduit en bulu le texte affiché des pages financières, entièrement sur l'appareil.

Autorisations :
- activeTab : l'extension n'agit que sur l'onglet ouvert, et seulement après un clic sur son icône. Sans ce clic, elle n'a accès à aucune page.
- scripting : après ce clic, elle place sa traduction sur la page en remplaçant les textes affichés par leur traduction validée.

Aucun accès à « tous les sites », aucun script automatique, aucune ressource accessible depuis le web. Aucune requête réseau : le dictionnaire bulu est dans l'extension. Rien n'est stocké, et les champs de saisie ne sont jamais lus.

Pour essayer : ouvrir https://mayem-api.mayem.workers.dev/demo, cliquer sur l'icône Mayem, puis sur « Envoyer de l'argent ».
```
