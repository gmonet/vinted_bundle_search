# Vinted Bundle Search

Trouve **le vendeur Vinted chez qui acheter un lot** : tu décris ce que tu cherches en une ou
plusieurs requêtes pondérées, l'outil lance les recherches Vinted, regroupe les articles par
vendeur et classe les vendeurs selon un score.

Fonctionne sur **PC** (extension de navigateur via userscript) et sur **Android** (APK, prévu pour
F-Droid), avec le même code.

## Principe

Une **recherche** contient une ou plusieurs **requêtes**. Chaque requête a :

- des mots-clés et tous les filtres Vinted : catégorie, marque, état, taille, couleur, matière, prix ;
- des **points** par article trouvé (entier ≥ 1) ;
- un **max** d'articles comptés (vide = illimité) ;
- l'option « tous les mots dans le titre », activée par défaut : la recherche Vinted est floue
  (« lego police » renvoie aussi des Playmobil), donc seuls les articles dont le titre ou la marque
  contient tous les mots sont comptés.

Les articles sont regroupés par vendeur : un **lot**. Son score est la somme des points de ses
articles, chaque article ne comptant que pour une requête, dans la limite du max de chaque
requête. L'affectation est optimale : un article qui correspond à deux requêtes est placé là où
il rapporte le plus. Ensuite, le **dressing complet** des meilleurs vendeurs est analysé pour
trouver des articles que la recherche Vinted n'avait pas remontés, et leur profil est chargé (note,
réduction lot, vacances).

**Exemple 1** : une requête « playmobil », état bon ou très bon, prix max 5 €, 1 point. Les
vendeurs qui ont beaucoup de Playmobil à moins de 5 € arrivent en tête.

**Exemple 2** : « playmobil police » à 4 points, max 2, et « lego police » à 2 points. Un vendeur
avec 2 Playmobil police et 5 Lego police obtient 2×4 + 5×2 = 18 points ; un troisième Playmobil
police ne rapporte rien de plus, il est affiché à part.

L'**historique** garde chaque recherche avec ses derniers résultats : tu peux la rouvrir, la
modifier, la dupliquer ou la relancer. Au relancement, les nouveaux articles sont signalés.
L'export/import (texte JSON) permet de transférer l'historique entre le PC et le téléphone.

## Installation

### PC (Firefox, Chrome, Edge…)

1. Installer l'extension [Violentmonkey](https://violentmonkey.github.io/) (ou Tampermonkey).
2. Ouvrir `vinted-bundle-search.user.js` (fichier des
   [releases](https://github.com/gmonet/vinted_bundle_search/releases) ou `dist/` après un
   `npm run build`) : l'extension propose de l'installer.
3. Aller sur [vinted.fr](https://www.vinted.fr) : un bouton **Lots** apparaît en bas à droite.

### Android

Installer l'APK (releases GitHub, puis F-Droid à terme). L'application ouvre vinted.fr dans une
WebView ; le bouton **Lots** ouvre l'outil. Les articles et profils s'ouvrent dans l'application
Vinted si elle est installée, sinon dans le navigateur.

Aucun compte n'est nécessaire. Tu peux te connecter à Vinted dans l'application, mais l'outil n'en
a pas besoin.

## Limites

- L'API web de Vinted n'est pas officielle et change régulièrement. Si la recherche casse, il faut
  mettre à jour `src/core/api.ts` (voir [docs/vinted-api.md](docs/vinted-api.md)).
- Si Vinted affiche une vérification anti-robot, la recherche s'arrête proprement avec un message ;
  il suffit de naviguer un peu sur Vinted ou de passer la vérification, puis de relancer.
- La correspondance dans les dressings est approximative : elle vérifie titre, marque, prix, état
  et taille, mais ni la catégorie ni la couleur, que Vinted ne fournit pas.
- Rythme volontairement modéré (~3 requêtes/s, séquentielles) : une recherche typique prend 10 à 30 s.

## Développement

```bash
npm ci
npm run check     # typecheck + tests + format
npm run dev       # http://localhost:8642 : page de dev avec API factice
npm run build     # dist/vinted-bundle-search.user.js et dist/vbs.js
npm run android   # APK debug (JDK 17 + Android SDK requis)
```

Architecture, conventions et pièges : voir [AGENTS.md](AGENTS.md).
Distribution F-Droid : voir [docs/fdroid.md](docs/fdroid.md).

## Licence et avertissement

[GPL-3.0-or-later](LICENSE). Projet indépendant, non affilié à Vinted. « Vinted » est une marque
de Vinted UAB. L'outil ne fait que lire des informations publiques, au rythme d'un humain ; il
n'achète rien et n'envoie aucun message à ta place.
