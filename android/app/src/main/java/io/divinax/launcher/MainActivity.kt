package io.divinax.launcher

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast

/** Экран лаунчера: интерфейс — HTML из assets/launcher, действия — через мост Native. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var prefs: Prefs
    private val main = Handler(Looper.getMainLooper())
    private var pushQueued = false
    private var pageReady = false
    private val listener: () -> Unit = { schedulePush() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Launcher.init(this)
        prefs = Prefs(this)
        applyBars()

        web = WebView(this)
        web.setBackgroundColor(0xFF060608.toInt())
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.addJavascriptInterface(Native(), "Native")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                pageReady = true
                push()
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                openExternal(request.url.toString())
                return true
            }
        }
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsets.CONSUMED
        }
        root.setBackgroundColor(0xFF060608.toInt())
        setContentView(root)
        web.loadUrl("file:///android_asset/launcher/index.html")

        Launcher.listeners += listener
        FrontService.listeners += listener
        Journal.listeners += listener

        if (!booted) {
            booted = true
            boot()
        }
    }

    override fun onDestroy() {
        Launcher.listeners -= listener
        FrontService.listeners -= listener
        Journal.listeners -= listener
        web.destroy()
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        schedulePush()
    }

    /** Первый запуск лаунчера в процессе: установка, автозапуск, проверка обновлений. */
    private fun boot() {
        Journal.add("Запуск лаунчера ${BuildConfig.VERSION_NAME}")
        if (Build.VERSION.SDK_INT >= 33 && !prefs.notifAsked &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            prefs.notifAsked = true
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        }
        if (prefs.checkOnLaunch) Launcher.checkUpdates()
        Launcher.prepareInstall {
            if (FrontService.running) {
                Launcher.refreshStats()
            } else if (prefs.autostart && WebInstall.installed(this) != null) {
                startFront(open = prefs.openAfterStart)
            }
        }
    }

    private fun startFront(open: Boolean) {
        FrontService.start(this)
        // ждём, пока сервер поднимется, затем открываем фронт
        val until = System.currentTimeMillis() + 15_000
        val check = object : Runnable {
            override fun run() {
                when {
                    FrontService.running -> {
                        Launcher.refreshStats()
                        if (open) Launcher.openFront()
                    }
                    FrontService.lastError != null || System.currentTimeMillis() > until -> Unit
                    else -> main.postDelayed(this, 150)
                }
            }
        }
        main.postDelayed(check, 150)
    }

    private fun schedulePush() {
        if (pushQueued) return
        pushQueued = true
        main.postDelayed({
            pushQueued = false
            push()
        }, 80)
    }

    private fun push() {
        if (!pageReady || isDestroyed) return
        web.evaluateJavascript("window.onLauncher&&onLauncher(${Launcher.stateJson()})", null)
    }

    private fun applyBars() {
        val light = prefs.theme == "light"
        val color = if (light) 0xFFF3F1EC.toInt() else 0xFF060608.toInt()
        @Suppress("DEPRECATION")
        window.statusBarColor = color
        @Suppress("DEPRECATION")
        window.navigationBarColor = color
        window.decorView.setBackgroundColor(color)
        window.insetsController?.setSystemBarsAppearance(
            if (light) android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS else 0,
            android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
        )
    }

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
            toast("Нет приложения, чтобы открыть ссылку")
        }
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // сначала закрываем модальные окна интерфейса
        web.evaluateJavascript("window.onBack?onBack():false") { handled ->
            if (handled != "true") moveTaskToBack(true)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_IMPORT && resultCode == RESULT_OK) data?.data?.let { Launcher.importBackup(it) }
    }

    /** Мост для launcher.js. Методы вызываются не из главного потока. */
    inner class Native {
        private fun ui(block: () -> Unit) = main.post(block)

        @JavascriptInterface fun state(): String = Launcher.stateJson()

        @JavascriptInterface fun setPref(key: String, value: String) {
            prefs.set(key, value)
            if (key == "theme") ui { applyBars() }
            if (key == "channel") Launcher.checkUpdates()
            schedulePush()
        }

        @JavascriptInterface fun start() = ui { startFront(open = prefs.openAfterStart) }

        @JavascriptInterface fun stop() = ui {
            Journal.add("Остановка сервера фронта")
            FrontService.shutdown(this@MainActivity)
        }

        @JavascriptInterface fun restart() = ui {
            Journal.add("Перезапуск фронта")
            FrontService.shutdown(this@MainActivity)
            main.postDelayed({ startFront(open = false) }, 300)
        }

        @JavascriptInterface fun open() = ui {
            if (FrontService.running) Launcher.openFront() else startFront(open = true)
        }

        @JavascriptInterface fun openBrowser() = ui { openExternal(Prefs.URL) }

        @JavascriptInterface fun copy(text: String) = ui {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Divinax", text))
            if (Build.VERSION.SDK_INT < 33) toast("Скопировано")
        }

        @JavascriptInterface fun checkUpdates() = Launcher.checkUpdates()
        @JavascriptInterface fun update() = Launcher.startUpdate()
        @JavascriptInterface fun cancelUpdate() = Launcher.cancelUpdate()
        @JavascriptInterface fun dismissUpdate() = Launcher.dismissUpdate()

        @JavascriptInterface fun exportBackup(withKeys: Boolean) = Launcher.exportBackupAsync(withKeys)

        @JavascriptInterface fun importBackup() = ui {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/json", "application/octet-stream", "text/plain"))
            }
            try {
                @Suppress("DEPRECATION")
                startActivityForResult(intent, REQ_IMPORT)
            } catch (_: Exception) {
                toast("Нет приложения для выбора файлов")
            }
        }

        @JavascriptInterface fun reinstall() = Launcher.reinstall()
        @JavascriptInterface fun reset(backupFirst: Boolean) = Launcher.reset(backupFirst)

        @JavascriptInterface fun copyLog() = copy(Journal.asText())

        @JavascriptInterface fun shareLog() = ui {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, Journal.asText())
            startActivity(Intent.createChooser(send, "Журнал Divinax"))
        }

        @JavascriptInterface fun clearLog() = Journal.clear()

        @JavascriptInterface fun openFolder() = ui {
            try {
                startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS))
            } catch (_: Exception) {
                toast("Бэкапы лежат в ${Launcher.BACKUP_DIR}")
            }
        }

        @JavascriptInterface fun openUrl(url: String) = ui { openExternal(url) }

        @JavascriptInterface fun minimize() = ui { moveTaskToBack(true) }

        @JavascriptInterface fun quit() = ui {
            FrontService.shutdown(this@MainActivity)
            booted = false
            finishAndRemoveTask()
        }
    }

    companion object {
        private const val REQ_IMPORT = 21
        private const val REQ_NOTIF = 22
        /** boot() — один раз на процесс, не при каждом повороте экрана. */
        private var booted = false
    }
}
