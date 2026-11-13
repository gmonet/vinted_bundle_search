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

## Recette de build (validée localement)

Fichier `metadata/io.github.gmonet.vintedbundlesearch.yml` de fdroiddata. Validé avec
`fdroid lint`, `fdroid rewritemeta` (aucune modification) et `fdroid build -l` (fdroidserver
2.4.5) : le scanner ne signale rien, et l'APK obtenu est **identique bit à bit** à
`./gradlew assembleRelease` lancé depuis le même commit, donc le build est reproductible.

```yaml
AntiFeatures:
  NonFreeNet:
    en-US: Depends on vinted.fr, a proprietary online marketplace.
    fr-FR: Dépend de vinted.fr, une place de marché en ligne propriétaire.
Categories:
  - Market & Price
License: GPL-3.0-or-later
AuthorName: gmonet
SourceCode: https://github.com/gmonet/vinted_bundle_search
IssueTracker: https://github.com/gmonet/vinted_bundle_search/issues
Changelog: https://github.com/gmonet/vinted_bundle_search/releases

AutoName: Bundle Search for Vinted

RepoType: git
Repo: https://github.com/gmonet/vinted_bundle_search.git

Builds:
  - versionName: 0.1.0
    versionCode: 100
    commit: ceb0916bbc83187a9e33ad35b5f527a5f01ade73
    subdir: android/app
    sudo:
      - apt-get update
      - apt-get install -y npm
    gradle:
      - yes
    build:
      - cd ../..
      - npm ci
      - npm run build

AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9.]+$
UpdateCheckData: package.json|"versionCode":\s*(\d+)|.|"version":\s*"([\d.]+)"
CurrentVersion: 0.1.0
CurrentVersionCode: 100
```

Points clés :

- `npm ci && npm run build` est dans `build:` et non dans `prebuild:`, parce que le scanner
  F-Droid s'exécute entre les deux. Lancé plus tôt, il supprimerait les binaires de
  `node_modules` (esbuild), ce qui casserait le build.
- `versionCode` est écrit en clair dans `package.json`, pour que `UpdateCheckData` le lise ;
  Gradle vérifie qu'il correspond à `version`.
- À chaque release, il suffit de mettre à jour `version` et `versionCode` dans `package.json`,
  d'ajouter `fastlane/metadata/android/*/changelogs/<versionCode>.txt` et de pousser le tag
  `vX.Y.Z`. F-Droid détecte le tag automatiquement.

Pour tester une modification de la recette en local (outillage installé dans
`~/.local/share/fdroid-tools`) :

```bash
cd ~/.local/share/fdroid-tools/fdroiddata
../venv/bin/fdroid lint io.github.gmonet.vintedbundlesearch
JAVA_HOME=~/.local/share/android-tools/jdk ../venv/bin/fdroid build -v -l io.github.gmonet.vintedbundlesearch
```

## Points d'attention pour la revue

- Nom : « Bundle Search for Vinted » (formulation « for X » des clients tiers). Si les
  relecteurs demandent un nom sans la marque, le changement ne touche que `strings.xml`,
  `fastlane/`, le README et l'en-tête du userscript.
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
