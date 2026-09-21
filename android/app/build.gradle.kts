plugins {
    id("com.android.application")
}
android {
    namespace = "uz.javlon.taqdimot"
    compileSdk = 36
    defaultConfig {
        applicationId = "uz.javlon.taqdimot"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }
    buildTypes {
        release {
            minifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies {
    implementation("androidx.activity:activity:1.11.0")
}
