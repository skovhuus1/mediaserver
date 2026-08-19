plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val castReceiverAppId = providers
    .gradleProperty("BB_MEDIA_CAST_RECEIVER_APP_ID")
    .orElse(providers.environmentVariable("BB_MEDIA_CAST_RECEIVER_APP_ID"))
    .getOrElse("CC1AD845")

val releaseStorePath = providers.environmentVariable("BB_MEDIA_ANDROID_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("BB_MEDIA_ANDROID_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("BB_MEDIA_ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("BB_MEDIA_ANDROID_KEY_PASSWORD").orNull
val hasReleaseSigning = listOf(
    releaseStorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }
val requireProductionSigning = providers
    .environmentVariable("BB_MEDIA_REQUIRE_PRODUCTION_SIGNING")
    .getOrElse("false")
    .equals("true", ignoreCase = true)

if (requireProductionSigning && !hasReleaseSigning) {
    throw GradleException("Production Android signing is required but the keystore configuration is incomplete")
}

android {
    namespace = "com.boltbytes.boltbytes_media"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.boltbytes.boltbytes_media"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        resValue("string", "cast_receiver_app_id", castReceiverAppId)
    }

    val productionSigning = if (hasReleaseSigning) {
        signingConfigs.create("production") {
            storeFile = file(releaseStorePath!!)
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    } else null

    buildTypes {
        release {
            signingConfig = productionSigning ?: signingConfigs.getByName("debug")
        }
    }
}

dependencies {
    implementation("com.google.android.gms:play-services-cast-framework:22.3.1")
    implementation("androidx.work:work-runtime-ktx:2.10.5")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
