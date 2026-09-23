import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Репозиторий, из которого лаунчер берёт обновления фронта (релизы web-<ветка>)
val updateRepo = providers.environmentVariable("DX_REPO").getOrElse("jellysilly/Divinax")

android {
    namespace = "io.divinax.launcher"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.divinax.launcher"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "UPDATE_REPO", "\"$updateRepo\"")
    }

    // Общий ключ в репозитории: сборки с CI и локальные ставятся поверх друг друга.
    // Для своего ключа задайте DX_KEYSTORE, DX_KEYSTORE_PASSWORD, DX_KEY_ALIAS, DX_KEY_PASSWORD.
    signingConfigs {
        create("shared") {
            storeFile = file(providers.environmentVariable("DX_KEYSTORE").getOrElse("launcher.keystore"))
            storePassword = providers.environmentVariable("DX_KEYSTORE_PASSWORD").getOrElse("divinax")
            keyAlias = providers.environmentVariable("DX_KEY_ALIAS").getOrElse("divinax")
            keyPassword = providers.environmentVariable("DX_KEY_PASSWORD").getOrElse("divinax")
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("shared")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // web.zip уже сжат
    androidResources { noCompress += "zip" }

    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

// Кладёт в assets орнаменты фронта и готовую сборку dist/ (web.zip + version.json).
// Если dist/ нет, лаунчер скачает фронт при первом запуске.
abstract class LauncherAssetsTask : DefaultTask() {
    @get:InputFiles
    abstract val dist: ConfigurableFileCollection

    @get:InputFiles
    abstract val ornaments: ConfigurableFileCollection

    @get:InputFiles
    abstract val packageJson: ConfigurableFileCollection

    @get:Internal
    abstract val repoDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    private fun git(vararg args: String): String = try {
        val pb = ProcessBuilder("git", *args).directory(repoDir.get().asFile).redirectErrorStream(true)
        pb.environment()["TZ"] = "UTC"
        val p = pb.start()
        val out = p.inputStream.bufferedReader().readText().trim()
        if (p.waitFor() == 0) out else ""
    } catch (_: Exception) {
        ""
    }

    @TaskAction
    fun run() {
        val out = outputDir.get().asFile
        out.deleteRecursively()
        val orn = File(out, "launcher/ornaments").apply { mkdirs() }
        ornaments.asFileTree.files.forEach { it.copyTo(File(orn, it.name), overwrite = true) }

        val distDir = File(repoDir.get().asFile, "dist")
        if (!File(distDir, "index.html").isFile) {
            logger.warn("dist/ не найден — фронт не будет вшит в APK (npm run build:web)")
            return
        }
        val version = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
            .find(packageJson.singleFile.readText())?.groupValues?.get(1) ?: "0.0.0"
        val commit = git("rev-parse", "--short", "HEAD")
        val date = git("log", "-1", "--date=format-local:%Y-%m-%dT%H:%M:%SZ", "--format=%cd")
        val branch = System.getenv("DX_BRANCH") ?: git("rev-parse", "--abbrev-ref", "HEAD")
        val json = """{"version":"$version","commit":"$commit","date":"$date","branch":"$branch"}"""
        ZipOutputStream(File(out, "web.zip").outputStream().buffered()).use { zip ->
            distDir.walkTopDown().filter { it.isFile && it.name != "version.json" }.forEach { f ->
                zip.putNextEntry(ZipEntry(f.relativeTo(distDir).invariantSeparatorsPath))
                f.inputStream().use { it.copyTo(zip) }
                zip.closeEntry()
            }
            zip.putNextEntry(ZipEntry("version.json"))
            zip.write(json.toByteArray())
            zip.closeEntry()
        }
    }
}

val launcherAssets = tasks.register<LauncherAssetsTask>("launcherAssets") {
    val root = rootProject.layout.projectDirectory.dir("..")
    repoDir.set(root)
    dist.from(root.dir("dist"))
    ornaments.from(root.dir("public/ornaments"))
    packageJson.from(root.file("package.json"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(launcherAssets, LauncherAssetsTask::outputDir)
    }
}
