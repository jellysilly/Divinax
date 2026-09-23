package io.divinax.launcher

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Все долгие операции лаунчера. Живёт в процессе приложения, не зависит от экрана. */
@SuppressLint("StaticFieldLeak")
object Launcher {
    private lateinit var ctx: Context
    private lateinit var prefs: Prefs
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    val listeners = CopyOnWriteArrayList<() -> Unit>()

    const val BACKUP_DIR = "Download/Divinax"

    // ── состояние для интерфейса ──
    @Volatile var busy = "" // export | import | reinstall | reset | update
        private set
    @Volatile var checking = false
        private set
    @Volatile var checkError: String? = null
        private set
    @Volatile var available: Updater.Release? = null
        private set
    @Volatile var channels: List<String> = emptyList()
        private set
    @Volatile var stats: JSONObject? = null
        private set

    class UpdateState(val target: String) {
        @Volatile var step = 0
        @Volatile var detail = arrayOf("", "", "", "", "")
        @Volatile var percent = 0 // общий прогресс
        @Volatile var error: String? = null
        @Volatile var finished = false
        @Volatile var cancelled = false
        val startedAt = System.currentTimeMillis()
    }

    @Volatile var update: UpdateState? = null
        private set

    fun init(context: Context) {
        if (::ctx.isInitialized) return
        ctx = context.applicationContext
        prefs = Prefs(ctx)
        Journal.init(ctx)
    }

    private fun changed() = listeners.forEach { it() }

    private fun <T> onMain(block: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        var result: Result<T>? = null
        val latch = CountDownLatch(1)
        main.post {
            result = runCatching(block)
            latch.countDown()
        }
        latch.await()
        return result!!.getOrThrow()
    }

    private fun task(name: String, block: () -> Unit) {
        if (busy.isNotEmpty()) return
        busy = name
        changed()
        worker.execute {
            try {
                block()
            } catch (e: Exception) {
                Journal.add("Ошибка: ${e.message ?: e.javaClass.simpleName}")
            } finally {
                busy = ""
                changed()
            }
        }
    }

    // ── запуск ──

    fun prepareInstall(done: () -> Unit) {
        worker.execute {
            try {
                WebInstall.ensureInstalled(ctx)
            } catch (e: Exception) {
                Journal.add("Не удалось установить встроенный фронт: ${e.message}")
            }
            changed()
            main.post(done)
        }
    }

    /** Сколько персонажей и чатов в хранилище фронта — для журнала. */
    fun refreshStats() {
        if (busy.isNotEmpty()) return
        worker.execute {
            try {
                val s = idb("stats").optJSONObject("stats")
                stats = s
                if (s != null) Journal.add("Загружено: ${plural(s.optInt("characters"), "персонаж", "персонажа", "персонажей")}, ${plural(s.optInt("chats"), "чат", "чата", "чатов")}, ${plural(s.optInt("groups"), "группа", "группы", "групп")}")
                changed()
            } catch (_: Exception) {
            }
        }
    }

    // ── обновления ──

    fun checkUpdates(quiet: Boolean = false) {
        if (checking) return
        checking = true
        checkError = null
        changed()
        Thread {
            try {
                if (!quiet) Journal.add("Проверка обновлений (ветка ${prefs.channel})")
                channels = try {
                    Updater.channels()
                } catch (e: Exception) {
                    channels
                }
                val rel = Updater.latest(prefs.channel)
                available = rel
                prefs.lastCheck = System.currentTimeMillis()
                val inst = WebInstall.installed(ctx)
                if (hasUpdate()) Journal.add("Проверка обновлений: доступна ${rel.version?.label ?: "новая сборка"}")
                else if (!quiet) Journal.add("Проверка обновлений: установлена последняя версия ${inst?.label ?: ""}".trim())
            } catch (e: Exception) {
                checkError = e.message ?: "нет сети"
                Journal.add("Проверка обновлений не удалась: $checkError")
            } finally {
                checking = false
                changed()
            }
        }.start()
    }

    fun hasUpdate(): Boolean {
        val rel = available ?: return false
        if (rel.channel != prefs.channel) return false
        val inst = WebInstall.installed(ctx) ?: return true
        val v = rel.version ?: return true
        return v.commit != inst.commit || v.branch != inst.branch
    }

    fun startUpdate() {
        val rel = available ?: return
        if (busy.isNotEmpty()) return
        val st = UpdateState(rel.version?.version ?: rel.channel)
        update = st
        busy = "update"
        changed()
        worker.execute {
            val wasRunning = FrontService.running
            val tmp = File(ctx.cacheDir, "update.zip")
            fun progress(step: Int, inStep: Double) {
                val weights = intArrayOf(5, 10, 55, 20, 10)
                var p = 0.0
                for (i in 0 until step) p += weights[i]
                p += weights[step] * inStep.coerceIn(0.0, 1.0)
                st.step = step
                st.percent = p.toInt()
                changed()
            }
            fun checkCancel() {
                if (st.cancelled) throw InterruptedException()
            }
            try {
                Journal.add("Обновление до ${rel.version?.label ?: rel.channel} (ветка ${rel.channel})")
                // 1. остановка
                progress(0, 0.0)
                FrontActivity.closeAll()
                if (FrontService.running) {
                    Journal.add("Остановка сервера фронта")
                    FrontService.shutdown(ctx)
                }
                st.detail[0] = if (wasRunning) "сервер остановлен корректно" else "сервер не был запущен"
                progress(1, 0.0)
                checkCancel()

                // 2. бэкап
                Journal.add("Создание автобэкапа")
                val name = exportBackup(auto = true, withKeys = true)
                st.detail[1] = name ?: "данных пока нет — пропущено"
                progress(2, 0.0)
                checkCancel()

                // 3. загрузка
                Journal.add("Загрузка версии ${rel.version?.version ?: ""} (ветка ${rel.channel})".replace("  ", " "))
                val from = WebInstall.installed(ctx)?.version ?: "—"
                Updater.download(rel.zipUrl, tmp, { st.cancelled }) { got, total ->
                    val t = if (total > 0) total else rel.zipSize
                    val frac = if (t > 0) got.toDouble() / t else 0.0
                    st.detail[2] = "$from → ${rel.version?.version ?: "?"} · ${(frac * 100).toInt()}%"
                    progress(2, frac)
                }
                Journal.add("Получено ${mb(tmp.length())}")
                progress(3, 0.0)
                checkCancel()

                // 4. установка
                val total = countEntries(tmp)
                WebInstall.install(ctx, tmp.inputStream(), { n ->
                    st.detail[3] = "$n из $total файлов"
                    progress(3, if (total > 0) n.toDouble() / total else 0.0)
                }, { st.cancelled })
                tmp.copyTo(WebInstall.packageZip(ctx), overwrite = true)
                st.detail[3] = "$total файлов"
                Journal.add("Установлено $total файлов", accent = true)
                progress(4, 0.0)

                // 5. запуск
                startAndWait()
                st.detail[4] = if (FrontService.running) Prefs.URL else (FrontService.lastError ?: "не запустился")
                progress(4, 1.0)
                st.finished = true
                Journal.add("Фронт обновлён до ${WebInstall.installed(ctx)?.label}", accent = true)
                if (FrontService.running && prefs.openAfterStart) main.post { openFront() }
            } catch (e: InterruptedException) {
                st.error = "Обновление отменено"
                Journal.add("Обновление отменено — осталась прежняя версия")
                if (wasRunning) startAndWait()
            } catch (e: Exception) {
                st.error = "Ошибка: ${e.message ?: e.javaClass.simpleName}"
                Journal.add("Обновление не удалось: ${e.message} — осталась прежняя версия")
                if (wasRunning) startAndWait()
            } finally {
                tmp.delete()
                busy = ""
                changed()
            }
        }
    }

    fun cancelUpdate() {
        update?.cancelled = true
        changed()
    }

    fun dismissUpdate() {
        if (busy == "update") return
        update = null
        changed()
    }

    private fun countEntries(zip: File): Int = ZipInputStream(zip.inputStream().buffered()).use { z ->
        var n = 0
        while (true) {
            val e = z.nextEntry ?: break
            if (!e.isDirectory) n++
        }
        n
    }

    private fun startAndWait() {
        onMain { FrontService.start(ctx) }
        val until = System.currentTimeMillis() + 15_000
        Thread.sleep(200)
        while ((FrontService.starting || !FrontService.running) && FrontService.lastError == null && System.currentTimeMillis() < until) Thread.sleep(100)
    }

    // ── обслуживание ──

    fun exportBackupAsync(withKeys: Boolean) = task("export") {
        val name = exportBackup(auto = false, withKeys = withKeys)
        if (name == null) Journal.add("Бэкап не нужен: во фронте ещё нет данных")
    }

    /** Возвращает имя файла или null, если сохранять нечего. */
    private fun exportBackup(auto: Boolean, withKeys: Boolean): String? {
        FrontActivity.flushAll()
        val json = File(ctx.cacheDir, "export.json").apply { delete() }
        try {
            val res = idb("export", "&keys=${if (withKeys) 1 else 0}", output = json)
            if (res.optBoolean("empty") || !json.isFile) return null
            val stamp = SimpleDateFormat("yyyy-MM-dd-HHmm", Locale.US).format(Date())
            val name = if (auto) "divinax-auto-$stamp.zip" else "divinax-$stamp.zip"
            val meta = JSONObject()
                .put("divinaxLauncher", 1)
                .put("date", System.currentTimeMillis())
                .put("front", WebInstall.installed(ctx)?.toJson() ?: JSONObject.NULL)
                .put("withKeys", withKeys)
                .put("stats", res.optJSONObject("stats") ?: JSONObject.NULL)
            saveToDownloads(name, "application/zip") { out ->
                ZipOutputStream(out).use { zip ->
                    zip.putNextEntry(ZipEntry("divinax-state.json"))
                    json.inputStream().use { it.copyTo(zip) }
                    zip.closeEntry()
                    zip.putNextEntry(ZipEntry("backup.json"))
                    zip.write(meta.toString(2).toByteArray())
                    zip.closeEntry()
                }
            }
            prefs.lastBackup = System.currentTimeMillis()
            Journal.add("Бэкап сохранён: $name", accent = true)
            return name
        } finally {
            json.delete()
        }
    }

    fun importBackup(uri: Uri) = task("import") {
        val raw = File(ctx.cacheDir, "import.raw")
        val json = File(ctx.cacheDir, "import.json")
        try {
            ctx.contentResolver.openInputStream(uri)?.use { input -> raw.outputStream().use { input.copyTo(it) } }
                ?: throw IOException("не удалось открыть файл")
            val head = raw.inputStream().use { val b = ByteArray(2); it.read(b); b }
            if (head[0] == 'P'.code.toByte() && head[1] == 'K'.code.toByte()) {
                var found = false
                ZipInputStream(raw.inputStream().buffered()).use { z ->
                    while (true) {
                        val e = z.nextEntry ?: break
                        if (e.name == "divinax-state.json" || (!found && e.name.endsWith(".json") && e.name != "backup.json")) {
                            json.outputStream().use { z.copyTo(it) }
                            found = true
                            if (e.name == "divinax-state.json") break
                        }
                    }
                }
                if (!found) throw IOException("в архиве нет бэкапа Divinax")
            } else {
                raw.renameTo(json)
            }
            Journal.add("Загрузка бэкапа: сначала сохраняю текущие данные")
            exportBackup(auto = true, withKeys = true)
            FrontActivity.closeAll()
            val res = idb("import", input = json)
            val s = res.optJSONObject("stats")
            stats = s
            Journal.add(
                "Бэкап загружен" + (s?.let { ": ${plural(it.optInt("characters"), "персонаж", "персонажа", "персонажей")}, ${plural(it.optInt("chats"), "чат", "чата", "чатов")}" } ?: ""),
                accent = true,
            )
        } finally {
            raw.delete()
            json.delete()
        }
    }

    fun reinstall() = task("reinstall") {
        val wasRunning = FrontService.running
        FrontActivity.closeAll()
        if (wasRunning) FrontService.shutdown(ctx)
        Journal.add("Переустановка файлов фронта (данные не затрагиваются)")
        try {
            WebInstall.reinstall(ctx, null)
            Journal.add("Фронт переустановлен: ${WebInstall.installed(ctx)?.label}", accent = true)
        } finally {
            if (wasRunning || prefs.autostart) startAndWait()
        }
    }

    fun reset(backupFirst: Boolean) = task("reset") {
        if (backupFirst) {
            Journal.add("Перезапуск с нуля: сохраняю бэкап")
            exportBackup(auto = true, withKeys = true)
        }
        FrontActivity.closeAll()
        val wasRunning = FrontService.running
        if (wasRunning) FrontService.shutdown(ctx)
        idb("reset")
        stats = null
        Journal.add("Данные фронта удалены", accent = true)
        startAndWait()
        if (FrontService.running && prefs.openAfterStart) main.post { openFront() }
    }

    fun openFront() {
        try {
            ctx.startActivity(FrontService.openIntent(ctx).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            Journal.add("Не удалось открыть: ${e.message}")
        }
    }

    // ── IndexedDB фронта через скрытый WebView на том же адресе ──

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun idb(op: String, extra: String = "", input: File? = null, output: File? = null): JSONObject {
        val stopTemp = FrontService.ensureServerFor(ctx)
        val token = UUID.randomUUID().toString().replace("-", "")
        Bridge.current = Bridge.Op(token, input, output)
        val latch = CountDownLatch(1)
        var result: String? = null
        var view: WebView? = null
        try {
            onMain {
                val w = WebView(ctx)
                view = w
                w.settings.javaScriptEnabled = true
                w.settings.domStorageEnabled = true
                w.addJavascriptInterface(object {
                    @JavascriptInterface
                    fun done(json: String) {
                        result = json
                        latch.countDown()
                    }
                }, "LauncherIdb")
                w.loadUrl("${Prefs.URL}/__launcher__/$token/idb.html?op=$op$extra")
            }
            if (!latch.await(180, TimeUnit.SECONDS)) throw IOException("хранилище фронта не ответило")
            val j = JSONObject(result ?: "{}")
            if (!j.optBoolean("ok")) throw IOException(j.optString("error", "ошибка хранилища"))
            return j
        } finally {
            onMain {
                view?.stopLoading()
                view?.destroy()
            }
            Bridge.current = null
            stopTemp()
        }
    }

    // ── файлы ──

    fun saveToDownloads(name: String, mime: String, write: (java.io.OutputStream) -> Unit): Uri {
        val resolver = ctx.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Divinax")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IOException("не удалось создать файл в Загрузках")
        try {
            resolver.openOutputStream(uri)?.use { write(it.buffered()) } ?: throw IOException("нет доступа к файлу")
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            return uri
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
    }

    // ── состояние для интерфейса ──

    fun stateJson(): String {
        val inst = WebInstall.installed(ctx)
        val up = update
        val o = JSONObject()
            .put("launcher", BuildConfig.VERSION_NAME)
            .put("prefs", JSONObject()
                .put("autostart", prefs.autostart)
                .put("openAfterStart", prefs.openAfterStart)
                .put("bootStart", prefs.bootStart)
                .put("checkOnLaunch", prefs.checkOnLaunch)
                .put("openInApp", prefs.openInApp)
                .put("backupKeys", prefs.backupKeys)
                .put("channel", prefs.channel)
                .put("theme", prefs.theme))
            .put("front", JSONObject()
                .put("running", FrontService.running)
                .put("starting", FrontService.starting)
                .put("startedAt", FrontService.startedAt)
                .put("url", Prefs.URL)
                .put("port", Prefs.PORT)
                .put("error", FrontService.lastError ?: JSONObject.NULL))
            .put("installed", inst?.toJson() ?: JSONObject.NULL)
            .put("available", available?.toJson() ?: JSONObject.NULL)
            .put("hasUpdate", hasUpdate())
            .put("channels", JSONArray(channels.ifEmpty { listOf(prefs.channel) }.let { if (prefs.channel in it) it else it + prefs.channel }))
            .put("checking", checking)
            .put("checkError", checkError ?: JSONObject.NULL)
            .put("lastCheck", prefs.lastCheck)
            .put("lastBackup", prefs.lastBackup)
            .put("backupDir", BACKUP_DIR)
            .put("busy", busy)
            .put("stats", stats ?: JSONObject.NULL)
            .put("repo", BuildConfig.UPDATE_REPO)
            .put("journal", Journal.toJson())
        if (up != null) {
            o.put("update", JSONObject()
                .put("target", up.target)
                .put("step", up.step)
                .put("detail", JSONArray(up.detail.toList()))
                .put("percent", up.percent)
                .put("error", up.error ?: JSONObject.NULL)
                .put("finished", up.finished)
                .put("cancelled", up.cancelled)
                .put("active", busy == "update")
                .put("log", JSONArray().apply {
                    Journal.since(up.startedAt).forEach { put(JSONObject().put("t", it.time).put("text", it.text).put("a", it.accent)) }
                }))
        }
        return o.toString()
    }

    private fun mb(bytes: Long) = String.format(Locale.US, "%.1f МБ", bytes / 1048576.0)

    fun plural(n: Int, one: String, few: String, many: String): String {
        val m10 = n % 10
        val m100 = n % 100
        val w = when {
            m10 == 1 && m100 != 11 -> one
            m10 in 2..4 && m100 !in 12..14 -> few
            else -> many
        }
        return "$n $w"
    }
}
