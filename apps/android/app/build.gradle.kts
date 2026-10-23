plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.villabridge.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.villabridge.android"
        minSdk = 24
        targetSdk = 35
        versionCode = 2
        versionName = "0.2-thin-client"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}
