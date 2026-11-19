# Atelier NSI · Épreuve pratique 2025

Entraînement destiné aux élèves de Terminale de la spécialité Numérique et sciences informatiques. L’atelier reprend les 48 sujets et les 96 exercices de l’archive fournie. Chaque PDF et chaque fichier Python d’origine est également disponible depuis la page de son sujet.

## Ouvrir l’atelier sur un poste Windows

1. Extrayez **tout** le fichier ZIP.
2. Double-cliquez sur `LANCER-ATELIER-WINDOWS.cmd`. Python 3 doit être installé.
3. Gardez la fenêtre de commande ouverte. Si le navigateur ne s’ouvre pas automatiquement, allez à [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

Sur macOS ou Linux, ouvrez un terminal dans le dossier extrait et saisissez `python3 lancer.py`. Le moteur Python de la page, les polices et les énoncés sont inclus dans l’archive. L’application est opérationnelle sur le poste avec le serveur local même lorsque le poste est déconnecté d’Internet.

## Mettre l’atelier en ligne avec GitHub Pages

1. Copiez le **contenu** du dossier `site` à la racine d’un dépôt dédié. Placez aussi le fichier `.nojekyll`, qui peut être masqué par votre système.
2. Dans **Settings → Pages**, sélectionnez **Deploy from a branch**, puis `main` et `/(root)`, et enregistrez.
3. Ouvrez l’adresse indiquée dans **Settings → Pages**. Essayez un sujet et exécutez `print(2 + 3)` sur un poste élève.

Si le dépôt utilise déjà `/docs` comme source GitHub Pages, copiez le contenu du dossier `site` dans `docs`.

## Travailler sur un exercice

- Choisissez le numéro du sujet, puis l’exercice. Les boutons **+**, **Texte** et **PDF** donnent trois manières de consulter l’énoncé. Les schémas restent lisibles dans le fac-similé et le PDF.
- Écrivez ou complétez le programme. **Exécuter** lance le code, avec le raccourci **Ctrl + Entrée** ou **⌘ + Entrée**. Ajoutez un appel à votre fonction pour en observer le résultat.
- Pour un programme qui appelle `input()`, renseignez une valeur par ligne dans **Valeurs pour input()**, avant l’exécution.
- **Vérifier** affiche les résultats sur des exemples et quelques cas ciblés. Les exigences portant sur une méthode, la récursivité ou les instructions interdites doivent aussi être vérifiées en lisant le code.
- **Simulation · 1 h** fixe le sujet et masque les vérifications. Le chronomètre continue après un rechargement de la page. Une fois le temps écoulé, l’élève peut terminer la simulation et exporter son travail.
- **Exporter .py** télécharge le code de l’exercice actif. Les modifications et la progression sont sauvegardées dans le navigateur utilisé, sur la même adresse. Sur un poste partagé, exportez le travail avant de quitter.

## Modifier l’application

Le dossier `sources` contient le code de l’interface, la configuration de compilation et l’importeur. Le dossier `site` contient la version directement utilisable. Pour reconstruire l’interface après une modification de `sources/src/app.js`, placez-vous dans `sources`, lancez `npm ci` puis `node build.mjs ../site`. Les licences des dépendances distribuées sont dans `site/assets/licences`.
