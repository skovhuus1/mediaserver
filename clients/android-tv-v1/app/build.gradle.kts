plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseStorePath = providers.environmentVariable("BB_MEDIA_ANDROID_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("BB_MEDIA_ANDROID_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("BB_MEDIA_ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("BB_MEDIA_ANDROID_KEY_PASSWORD").orNull
val releaseVersionName = providers.gradleProperty("BB_MEDIA_VERSION_NAME").getOrElse("1.0.0")
val releaseVersionCode = providers.gradleProperty("BB_MEDIA_VERSION_CODE").orNull?.toIntOrNull() ?: 101000001

require(Regex("^[0-9]+\\.[0-9]+\\.[0-9]+$").matches(releaseVersionName)) {
    "BB_MEDIA_VERSION_NAME must be a numeric semantic version"
}
require(releaseVersionCode in 1..2_100_000_000) {
    "BB_MEDIA_VERSION_CODE must fit Android's supported range"
}

val hasReleaseSigning = listOf(
    releaseStorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }
val releaseTaskRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}

if (releaseTaskRequested && !hasReleaseSigning) {
    throw GradleException(
        "Release signing requires BB_MEDIA_ANDROID_KEYSTORE_PATH, BB_MEDIA_ANDROID_STORE_PASSWORD, " +
            "BB_MEDIA_ANDROID_KEY_ALIAS and BB_MEDIA_ANDROID_KEY_PASSWORD",
    )
}

android {
    namespace = "com.boltbytes.media.tv.v1"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.boltbytes.boltbytes_media.tv"
        minSdk = 24
        targetSdk = 37
        versionCode = releaseVersionCode
        versionName = releaseVersionName
        buildConfigField("String", "SERVER_URL", "\"https://media.boltbytes.com/api/v1\"")
    }

    val productionSigning = if (hasReleaseSigning) {
        signingConfigs.create("production") {
            storeFile = file(releaseStorePath!!)
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    } else {
        null
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".v1"
        }
        release {
            signingConfig = productionSigning
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.08.00"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.tv:tv-material:1.1.0")
    implementation("androidx.media3:media3-exoplayer:1.11.0")
    implementation("androidx.media3:media3-ui:1.11.0")
}
