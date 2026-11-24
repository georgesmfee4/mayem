# Reprise du travail, finale SAFINUM

Document de reprise, à lire au début d'une nouvelle session. État au 24 novembre 2026, branche
`revision/fidelite-bulu-j6je5a`, pull request n° 18 vers `main`. Les règles du projet sont dans `CLAUDE.md`.

## Consignes de travail
- Répondre en français, simplement, en expliquant ce qui est fait.
- Aucune mention d'assistant ou d'IA dans les commits, les pull requests ni les fichiers : pas de ligne
  « Co-Authored-By », pas de lien de session. Auteur des commits : georgesmfee4.
- Une traduction ne s'affiche que validée par deux personnes ; ne jamais inventer de bulu.

## La finale
- Pitch le **samedi 28 novembre, 12 h 30**, salle tripartite : 3 minutes de présentation, 5 minutes de questions,
  devant le jury et le public (ministres des Finances et des Télécommunications, BEAC, CNEF, GECAM, Huawei, Wave).
  Résultats à 14 h. Lancement du hackathon le jeudi 26 à 13 h 30 ; cocktail le mercredi 25 au soir.
- Exigence : une couche d'API branchée devant un service financier existant, sans modifier son code, qui comprend
  les intentions de l'utilisateur et traduit. Cinq environnements de test, dont trois obligatoires :
  **application mobile, web, USSD**. Le bac à sable (sandbox) SAFINUM doit être fourni : documentation attendue.
- Dix scénarios du jury : solde, transfert, frais, historique, correction, requête ambiguë, solde insuffisant,
  changement de langue, interaction multicanale, terminologie.

## Ce qui est fait
- **Noyau conversationnel** (`core/comprendre.ts`, `core/nombres.ts`, `core/operation.ts`, `service/conversation.ts`) :
  intention expliquée, montants en chiffres et en lettres, numéros camerounais, contacts homonymes, négation,
  correction, question dans le doute, récapitulatif puis « oui » avant toute exécution, changement de langue sans perte,
  même empreinte d'opération sur tous les canaux. Les dix scénarios passent (`npm run scenarios`).
- **Passerelle** (`service/passerelle.ts`, `npm run passerelle`) : relais USSD (écrans traduits, phrase transformée en
  touches, code PIN masqué, ligne « 0. Langue » sans nommer de langue, choix de langue au premier appel et retrouvé
  ensuite), relais de l'API mobile (réponses JSON traduites), assistant, journal aux colonnes du jury, tableau de bord
  `/tableau`, simulateurs `/essai/telephone` et `/essai/application`. Banque d'essai fictive (`fixtures/services/`),
  code PIN d'essai 1234. Un service se branche par un profil (`profiles/banque-essai.json`).
- **Tableurs des locuteurs importés** (`tools/import_finale.py`) : pack 0.10.0, 203 phrases validées, réponses en bulu
  par canal (`finale/variantes.csv`), explications des termes en bulu, formulations pour comprendre le bulu.
- **Compréhension du bulu** : 23 phrases sur 40 au test à l'aveugle (`npm run mesure`), aucune exécution sur une
  intention fausse. Le français est entièrement compris.
- **Terminologie décidée** : facture = Faktur, opération = Opération, crédit téléphonique = Kredi, reçu = Resu,
  solde insuffisant = Mebal teké yiane.
- Studio de voix publié sur le site de l'API (`/studio`) ; extension prête pour la boutique.
- Tests : `npm test` (214 réussis), `npm run pack`, `npm run test:navigateur` (21 réussis).

## En attente des locuteurs (tableur `retours-finale-bulu.xlsx`, hors git)
1. **RF032**, récapitulatif de transfert : « Mebal (frais) » faux, les frais se disent Minkuk. Tant qu'il n'est pas
   corrigé, la phrase reste en français. Priorité absolue.
2. RF026 et RF034 (accolade manquante), RF042 (nom au lieu du numéro), RF052 (montant écrit deux fois), RF114
   (« jamais » absent d'un message de sécurité), V06 et V07, G07 (billets traduits « carte »), U16, U20 contre X25.
3. Nombres douteux : 15 000, 25 000, 75 000 ; écarts avec le glossaire pour 1, 1 000 et 1 000 000.
4. Neuf réponses à traduire : RF014 à RF017, RF044, RF067, RF068, RF083, RF095.
5. Pour dépasser 58 % : 5 à 10 formulations de plus pour les frais, l'historique, l'annulation et l'aide.
   Ne jamais réutiliser les phrases du test à l'aveugle.
Import d'un tableur rempli : `python3 tools/import_finale.py fichier.xlsx`, puis `npm run pack` et `npm test`.

## Prochaines étapes
1. **Dès réception du bac à sable** : lire sa documentation, écrire son profil dans `profiles/`, adapter si besoin la
   lecture des messages USSD (`lireUssd`, `ecrireUssd` dans `service/ussd.ts`, convention CON / END), relier
   l'identifiant client de son API (`api.client` du profil), remplacer la banque d'essai par son raccord.
   Premier test : le simulateur USSD accepte-t-il les lettres dans les saisies ?
2. **Mettre la passerelle en ligne** à une adresse publique (Cloudflare), et garder la langue choisie dans un stockage
   durable (même contrat que `service/preferences.ts` : seule la langue, rattachée à l'empreinte du numéro).
3. Canaux 4 et 5 : SMS, serveur vocal (messages enregistrés au studio), guichet.
4. Préparer le pitch de 3 minutes et les 15 questions probables du jury avec leurs réponses ; répétitions vendredi.
5. Démonstration de secours sans réseau : banque d'essai et simulateurs.

## Questions à poser aux organisateurs
- Format exact des environnements (qui appelle qui, format des messages USSD, authentification).
- Comment envoyer nos résultats au tableau de bord du jury.
- Le simulateur mobile est-il une page web ou une application Android ?
- Internet sera-t-il disponible le samedi ?
