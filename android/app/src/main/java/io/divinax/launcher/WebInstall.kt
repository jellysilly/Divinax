package io.divinax.launcher

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.zip.ZipInputStream

/**
 * Установленная сборка фронта (dist/) в files/web/current.
 * Установка идёт в staging, затем current → previous, staging → current: при ошибке старая версия остаётся.
 */
object WebInstall {
    data class Version(val version: String, val commit: String, val date: String, val branch: String) {
        fun toJson(): JSONObject = JSONObject().put("version", version).put("commit", commit).put("date", date).put("branch", branch)
        val label get() = if (commit.isNotEmpty()) "$version · $commit" else version

        companion object {
            fun parse(text: String): Version? = try {
                val j = JSONObject(text)
                Version(j.optString("version", "?"), j.optString("commit"), j.optString("date"), j.optString("branch"))
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun base(ctx: Context) = File(ctx.filesDir, "web")
    fun current(ctx: Context) = File(base(ctx), "current")
    private fun previous(ctx: Context) = File(base(ctx), "previous")
    private fun staging(ctx: Context) = File(base(ctx), "staging")
    /** Архив установленной версии — для переустановки без сети. */
    fun packageZip(ctx: Context) = File(base(ctx), "current.zip")

    fun installed(ctx: Context): Version? {
        val dir = current(ctx)
        if (!File(dir, "index.html").isFile) return null
        val v = File(dir, "version.json")
        return (if (v.isFile) Version.parse(v.readText()) else null) ?: Version("?", "", "", "")
    }

    fun hasBundled(ctx: Context) = try {
        ctx.assets.open("web.zip").close(); true
    } catch (_: IOException) {
        false
    }

    fun bundled(ctx: Context): Version? = try {
        ZipInputStream(ctx.assets.open("web.zip")).use { zip ->
            generateSequence { zip.nextEntry }.firstOrNull { it.name == "version.json" }?.let { Version.parse(zip.readBytes().decodeToString()) }
        }
    } catch (_: IOException) {
        null
    }

    /** Первый запуск или в APK вшита более свежая сборка, чем установлена. */
    fun ensureInstalled(ctx: Context): Boolean {
        val inst = installed(ctx)
        val bundled = bundled(ctx) ?: return inst != null
        if (inst == null || (bundled.date.isNotEmpty() && bundled.date > inst.date && inst.branch == bundled.branch)) {
            Journal.add(if (inst == null) "Установка встроенного фронта ${bundled.label}" else "В лаунчере более новый фронт: ${bundled.label}")
            ctx.assets.open("web.zip").use { install(ctx, it, null) }
            File(base(ctx), "current.zip").delete()
            Journal.add("Фронт ${bundled.label} установлен", accent = true)
        }
        return true
    }

    /** Распаковывает zip со сборкой. progress(распаковано файлов). */
    fun install(ctx: Context, input: InputStream, progress: ((Int) -> Unit)?, cancelled: () -> Boolean = { false }) {
        val stage = staging(ctx)
        stage.deleteRecursively()
        stage.mkdirs()
        val canonical = stage.canonicalPath + File.separator
        var count = 0
        ZipInputStream(input.buffered()).use { zip ->
            while (true) {
                if (cancelled()) throw InterruptedException()
                val entry = zip.nextEntry ?: break
                val out = File(stage, entry.name)
                if (!out.canonicalPath.startsWith(canonical)) throw IOException("Недопустимый путь в архиве: ${entry.name}")
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zip.copyTo(it) }
                    count++
                    if (count % 20 == 0) progress?.invoke(count)
                }
            }
        }
        // архив мог быть собран с папкой dist/ внутри
        val root = findRoot(stage) ?: run {
            stage.deleteRecursively()
            throw IOException("В архиве нет index.html")
        }
        val prev = previous(ctx)
        val cur = current(ctx)
        prev.deleteRecursively()
        if (cur.exists() && !cur.renameTo(prev)) throw IOException("Не удалось заменить старую версию")
        if (!root.renameTo(cur)) {
            prev.renameTo(cur)
            throw IOException("Не удалось установить новую версию")
        }
        stage.deleteRecursively()
        prev.deleteRecursively()
    }

    private fun findRoot(dir: File): File? {
        if (File(dir, "index.html").isFile) return dir
        return dir.listFiles()?.filter { it.isDirectory }?.firstNotNullOfOrNull { d -> d.takeIf { File(it, "index.html").isFile } }
    }

    /** Переустановка: из сохранённого архива или из APK. */
    fun reinstall(ctx: Context, progress: ((Int) -> Unit)?) {
        val pkg = packageZip(ctx)
        when {
            pkg.isFile -> pkg.inputStream().use { install(ctx, it, progress) }
            hasBundled(ctx) -> ctx.assets.open("web.zip").use { install(ctx, it, progress) }
            else -> throw IOException("Нет сохранённой сборки — обновите фронт из сети")
        }
    }
}
