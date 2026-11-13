import groovy.json.JsonSlurper
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Single source of truth for the version: the root package.json ("version" + "versionCode",
// the latter is read as-is by F-Droid's update checker). Convention: major*10000+minor*100+patch.
val pkg = JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>
val appVersion = pkg["version"] as String
val appVersionCode = (pkg["versionCode"] as Number).toInt()
val (vMajor, vMinor, vPatch) = appVersion.split(".").map { it.takeWhile(Char::isDigit).toInt() }
check(appVersionCode == vMajor * 10000 + vMinor * 100 + vPatch) {
    "package.json versionCode ($appVersionCode) does not match version $appVersion"
}

// The web bundle (TypeScript UI + engine) is built by `npm run build` at the repo root.
val webBundle = rootProject.file("../dist/vbs.js")
val webAssetsDir = layout.buildDirectory.dir("generated/webassets")
val copyWebBundle by tasks.registering(Copy::class) {
    description = "Copies the injected web bundle (../dist/vbs.js) into the APK assets."
    from(webBundle)
    into(webAssetsDir)
    doFirst {
        if (!webBundle.exists()) {
            throw GradleException("Missing ${webBundle.path}: run `npm ci && npm run build` at the repository root first.")
        }
    }
}

// Optional release signing for direct APK distribution (F-Droid signs its own builds).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "io.github.gmonet.vintedbundlesearch"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.gmonet.vintedbundlesearch"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersion
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    sourceSets["main"].assets.srcDir(webAssetsDir)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // Reproducible builds (F-Droid): no dependency metadata blob in the APK.
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
}

tasks.named("preBuild") { dependsOn(copyWebBundle) }
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(copyWebBundle)
}
