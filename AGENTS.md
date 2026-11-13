# AGENTS.md

Guide pour les agents IA (Claude Code, Codex, etc.) et les humains qui travaillent sur ce dépôt.
Lis-le en entier avant de modifier du code. Garde-le à jour quand tu changes l'architecture,
les commandes ou ce que l'on sait de l'API Vinted.

## Le projet en une phrase

Recherche Vinted **multi-requêtes pondérées** : chaque requête est une recherche Vinted
(mots-clés + filtres) avec des **points** et un **max** ; les articles sont regroupés par
vendeur et chaque **lot** (= tous les articles d'un vendeur) reçoit un score. Le but : trouver
le vendeur chez qui acheter un lot (frais de port uniques, réduction lot).

## Vocabulaire (l'UI est en français, le code en anglais)

| UI        | Code        | Sens                                                                |
| --------- | ----------- | ------------------------------------------------------------------- |
| Recherche | `SearchDef` | Ensemble nommé de requêtes + réglages, enregistré dans l'historique |
| Requête   | `Query`     | Une recherche Vinted, avec `points` (≥ 1) et `max` (null = ∞)       |
| Lot       | `Lot`       | Articles d'un même vendeur, avec score, prix et remplissage         |
| Dressing  | wardrobe    | Tous les articles en vente d'un vendeur                             |

## Architecture

Un **seul bundle JS** (TypeScript + Preact) est injecté dans une page `www.vinted.fr` :

- **PC** : userscript (Violentmonkey/Tampermonkey), `dist/vinted-bundle-search.user.js`.
- **Android** : app Kotlin minimale (`android/`) = une WebView sur vinted.fr qui injecte
  `assets/vbs.js` (copie de `dist/vbs.js`) à chaque `onPageFinished`.

Pourquoi : les requêtes partent du vrai contexte du site (cookies, protection anti-bot
DataDome), donc pas de CORS, pas de serveur, pas de compte requis. Ne propose pas de backend
ou de proxy sans en discuter : c'est un choix délibéré.

```
src/
  core/            logique pure, testée, sans DOM (sauf fetch)
    types.ts       modèle de données + valeurs par défaut
    api.ts         client Vinted (endpoints, parsing, throttling, retries, détection anti-bot)
    engine.ts      orchestration : recherches → regroupement → dressings → profils
    scoring.ts     affectation optimale articles→requêtes (matroïde + chemins augmentants)
    matching.ts    correspondance locale titre/marque/prix/état (dressings, mode strict)
    storage.ts     historique (KVStore abstrait), export/import, migration
  ui/              composants Preact, rendus dans un Shadow DOM (styles.css isolé)
  platform.ts      différences PC / Android (stockage, ouverture de liens, partage)
  main.tsx         point d'entrée : crée l'hôte <vbs-root>, monte l'app, expose window.__vbs
android/           app Kotlin sans AndroidX : MainActivity (WebView) + Bridge (window.VbsAndroid)
dev/               page de dev avec API factice + sonde du moteur pour le vrai Vinted
tests/             tests vitest du cœur (fixtures = réponses API synthétiques)
docs/              API Vinted, distribution F-Droid
```

Règles de dépendance : `core/` n'importe jamais `ui/` ni `platform.ts`. Toute logique
testable va dans `core/` avec un test.

## Commandes

```bash
npm ci                 # installer
npm run check          # typecheck + tests + format:check (à lancer avant chaque commit)
npm test               # tests seuls
npm run build          # dist/vbs.js + dist/vinted-bundle-search.user.js
npm run dev            # watch + serveur http://localhost:8642 (page de dev avec API factice)
npm run format         # prettier
npm run android        # build JS puis APK debug (nécessite JAVA_HOME et ANDROID_HOME)
```

Android (JDK 17, SDK 35) :
`cd android && ./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
Le build Gradle échoue explicitement si `dist/vbs.js` n'existe pas. La version de l'APK est lue
dans `package.json` (versionCode = major·10000 + minor·100 + patch).

## Tester

1. **Logique** : `npm test`. Tout changement de `core/` doit avoir un test. Les exemples de la
   spec d'origine sont dans `tests/scoring.test.ts` et `tests/engine.test.ts`.
2. **UI** : `npm run dev` puis http://localhost:8642/ (API factice, `?challenge` simule le
   blocage anti-bot). Ne nécessite pas Vinted.
3. **Vrai Vinted** : installer le userscript depuis http://localhost:8642/vinted-bundle-search.user.js
   dans Violentmonkey. Pour un agent qui pilote Chrome : Chrome bloque les `<script>` vers
   localhost depuis vinted.fr (Local Network Access), il faut injecter le code. La sonde
   `dist/core-probe.js` (moteur seul, ~11 Ko minifié via
   `npx esbuild dev/core-probe.ts --bundle --minify`) expose `window.__vbsCore`.
   L'outil JS de Chrome masque les sorties contenant `?`, `=`, `&` : formate les résultats en
   conséquence.

## API Vinted

Voir [docs/vinted-api.md](docs/vinted-api.md). L'API est **non documentée et change** (fin
2026, `www.vinted.fr/api/v2/catalog/items` → 404, remplacé par
`api.vinted.fr/svc-catalogue/items`). Si une requête casse, vérifie d'abord sur le site avec les
outils réseau, puis mets à jour `api.ts`, les fixtures de test et `docs/vinted-api.md`.

Bonnes pratiques : rester poli (throttle 350 ms par défaut dans `VintedClient`, requêtes
séquentielles), ne jamais contourner une vérification anti-bot, ne jamais automatiser d'achat
ni de message. L'outil lit des données publiques et aide à décider, l'utilisateur agit lui-même.

## Conventions

- TypeScript strict (`noUncheckedIndexedAccess`). Pas de `any` sans commentaire.
- Code et commentaires en anglais ; textes d'interface et docs utilisateur en français.
- Prettier (largeur 100, quotes simples). Kotlin : style officiel, 4 espaces.
- Pas de nouvelle dépendance runtime sans bonne raison (le bundle est injecté dans Vinted et
  l'APK doit rester compatible F-Droid : aucune lib propriétaire, pas de Google Play Services).
- Stockage : toujours via `KVStore` (localStorage sur PC, fichiers privés via le bridge sur
  Android). Format versionné (`history.v1`) ; toute évolution du modèle passe par `migrate()`.
- Les sorties de build (`dist/`, APK) ne sont pas versionnées.
- Commits : messages courts à l'impératif, en français ou en anglais, un sujet par commit.
  `npm run check` doit passer.

## Pièges connus

- `useState` setter + fonction : `setX(fn)` appelle `fn` comme updater. Pour stocker une
  fonction, `setX(() => fn)` (cf. `setOverlay` dans `App.tsx`).
- L'hôte `<vbs-root>` a `all: initial` : les propriétés héritées (`color-scheme`, police)
  doivent être redéfinies dans le shadow DOM.
- La recherche Vinted est floue (« lego police » renvoie des Playmobil pompiers) : d'où le
  mode `strict` des requêtes (activé par défaut).
- Les articles du dressing n'ont ni catégorie ni couleur : la correspondance locale ignore ces
  filtres (badge « Dressing » dans l'UI).
- Android : `targetSdk 35` impose l'affichage bord à bord, d'où les insets dans `MainActivity`.
