# Distribution Android / F-Droid

## Ce qui est déjà conforme

- Licence libre (GPL-3.0-or-later), aucune dépendance propriétaire (pas d'AndroidX, de Google
  Play Services ni de tracker) : seulement la bibliothèque standard Kotlin.
- L'APK est construit depuis les sources : `npm ci && npm run build` (bundle JS non minifié,
  donc lisible), puis Gradle. Le wrapper Gradle vérifie le SHA-256 de sa distribution.
- `dependenciesInfo` est désactivé (blob Google refusé par F-Droid).
- Métadonnées fastlane dans `fastlane/metadata/android/` (titre, descriptions, changelogs par
  `versionCode`).
- Version unique dans `package.json`, lue par Gradle.

## Anti-features à déclarer

- `NonFreeNet` : l'application dépend d'un service non libre (vinted.fr).

## Recette de build (à proposer dans fdroiddata)

Fichier `metadata/io.github.gmonet.vintedbundlesearch.yml` (adapter le commit/tag) :

```yaml
Categories:
  - Shopping
License: GPL-3.0-or-later
AuthorName: gmonet
SourceCode: https://github.com/gmonet/vinted_bundle_search
IssueTracker: https://github.com/gmonet/vinted_bundle_search/issues
AntiFeatures:
  NonFreeNet: {}

AutoName: Vinted Bundle Search

RepoType: git
Repo: https://github.com/gmonet/vinted_bundle_search.git

Builds:
  - versionName: 0.1.0
    versionCode: 100
    commit: v0.1.0
    subdir: android/app
    sudo:
      - apt-get update
      - apt-get install -y npm
    prebuild:
      - cd ../..
      - npm ci
      - npm run build
    gradle:
      - yes

AutoUpdateMode: Version
UpdateCheckMode: Tags ^v\d+\.\d+\.\d+$
UpdateCheckData: package.json|"version":\s*"(\d+)\.(\d+)\.(\d+)"|.|"version":\s*"([\d.]+)"
CurrentVersion: 0.1.0
CurrentVersionCode: 100
```

> `UpdateCheckData` est à vérifier avec `fdroid checkupdates` : le versionCode est calculé
> (major·10000 + minor·100 + patch), et F-Droid préfère parfois un `versionCode` littéral dans
> `build.gradle.kts`. Si la revue le demande, écrire les deux valeurs en dur et les synchroniser
> avec `package.json` au moment de la release.

## Points d'attention pour la revue

- Le nom contient la marque « Vinted » : les relecteurs F-Droid peuvent demander un nom neutre
  (par ex. « Bundle Search for Vinted » ou un nom propre). Le changement ne touche que
  `strings.xml`, `fastlane/` et le README.
- Alternative si l'inclusion dans le dépôt principal traîne : héberger son propre dépôt F-Droid
  (`fdroid init` + `fdroid update`, publié sur GitHub Pages) ou utiliser
  [Obtainium](https://github.com/ImranR98/Obtainium) sur les releases GitHub.

## Signature pour les releases GitHub

F-Droid signe ses propres builds. Pour publier un APK sur GitHub :

1. Créer une clé, une seule fois, et la conserver précieusement :
   `keytool -genkeypair -v -keystore release.jks -alias vbs -keyalg RSA -keysize 4096 -validity 10000`
2. Copier `android/keystore.properties.example` vers `android/keystore.properties` (ignoré par
   git) et le remplir, ou configurer les secrets `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD` pour le workflow de
   release.
3. Lancer `./gradlew assembleRelease` pour obtenir `app/build/outputs/apk/release/app-release.apk`.
