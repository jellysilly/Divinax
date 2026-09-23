package io.divinax.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.View
import android.view.WindowInsets
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebMessage
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Фронт во встроенном окне. Данные (IndexedDB) лежат в профиле WebView приложения,
 * поэтому бэкапы и сброс из лаунчера работают именно с ними.
 */
class FrontActivity : Activity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Launcher.init(this)
        current = WeakReference(this)

        web = WebView(this)
        web.setBackgroundColor(0xFF060608.toInt())
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
        }
        web.webViewClient = Client()
        web.webChromeClient = Chrome()

        val root = FrameLayout(this)
        root.setBackgroundColor(0xFF060608.toInt())
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsets.CONSUMED
        }
        setContentView(root)

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(Prefs.URL)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        flush()
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        web.destroy()
        super.onDestroy()
    }

    // «Назад» возвращает в лаунчер, а фронт остаётся открытым в фоне — без перезагрузки
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    }

    /** Фронт пишет в IndexedDB с задержкой 350 мс — дёргаем его beforeunload, чтобы сохранить сразу. */
    private fun flush() {
        web.evaluateJavascript("try{dispatchEvent(new Event('beforeunload'))}catch(e){}", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_FILE) return
        val cb = fileCallback ?: return
        fileCallback = null
        if (resultCode != RESULT_OK || data == null) {
            cb.onReceiveValue(null)
            return
        }
        val clip = data.clipData
        val uris = if (clip != null) Array(clip.itemCount) { clip.getItemAt(it).uri } else listOfNotNull(data.data).toTypedArray()
        cb.onReceiveValue(uris)
    }

    private fun isFront(uri: Uri) = uri.scheme == "http" && (uri.host == "127.0.0.1" || uri.host == "localhost") && uri.port == Prefs.PORT

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (isFront(uri)) return false
            // внешние ссылки — в браузер
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: ActivityNotFoundException) {
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            portSent = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (url != null && isFront(Uri.parse(url))) installDownloads()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val msg = if (FrontService.running) "Фронт не отвечает: ${error.description}" else "Фронт не запущен."
            view.loadDataWithBaseURL(
                null,
                """<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#060608;color:#ebe9ee;font:15px system-ui;text-align:center">
                <div><div style="font-size:40px">✦</div><p>$msg</p><p><a style="color:#fff" href="${Prefs.URL}">Повторить</a></p></div></body>""",
                "text/html", "utf-8", null,
            )
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                // accept у фронта — расширения (.png,.json), поэтому показываем все файлы
                type = "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
            }
            return try {
                @Suppress("DEPRECATION")
                startActivityForResult(Intent.createChooser(intent, null), REQ_FILE)
                true
            } catch (_: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }
    }

    // ── скачивание файлов (бэкапы, экспорт карточек и чатов) ──
    // Фронт скачивает через <a download href="blob:…">. Перехватываем click и передаём файл
    // по MessagePort, который получает только главный фрейм (не iframe-песочницы сообщений).

    private var portSent = false
    private var hostPort: android.webkit.WebMessagePort? = null

    private fun installDownloads() {
        web.evaluateJavascript(DOWNLOAD_SHIM) { sendPort() }
    }

    private fun sendPort() {
        if (portSent) return
        portSent = true
        val ports = web.createWebMessageChannel()
        hostPort?.close()
        hostPort = ports[0]
        ports[0].setWebMessageCallback(object : android.webkit.WebMessagePort.WebMessageCallback() {
            override fun onMessage(port: android.webkit.WebMessagePort, message: WebMessage) {
                val data = message.data ?: return
                Thread { saveDownload(data) }.start()
            }
        })
        web.postWebMessage(WebMessage("divinax-download-port", arrayOf(ports[1])), Uri.parse(Prefs.URL))
    }

    private fun saveDownload(data: String) {
        try {
            val j = JSONObject(data)
            val name = j.optString("name").ifBlank { "divinax-file" }.replace(Regex("[\\\\/:*?\"<>|]"), "_")
            val url = j.getString("data")
            val comma = url.indexOf(',')
            val meta = url.substring(5, comma)
            val bytes = if (meta.endsWith(";base64")) Base64.decode(url.substring(comma + 1), Base64.DEFAULT)
            else Uri.decode(url.substring(comma + 1)).toByteArray()
            val mime = meta.substringBefore(';').ifBlank { WebServer.type(name) }
            Launcher.saveToDownloads(name, mime) { it.write(bytes) }
            Journal.add("Файл из фронта сохранён: Загрузки/Divinax/$name")
            runOnUiThread { Toast.makeText(this, "Сохранено в Загрузки/Divinax/$name", Toast.LENGTH_LONG).show() }
        } catch (e: Exception) {
            runOnUiThread { Toast.makeText(this, "Не удалось сохранить файл: ${e.message}", Toast.LENGTH_LONG).show() }
        }
    }

    companion object {
        private const val REQ_FILE = 11
        private var current: WeakReference<FrontActivity>? = null
        private val main = Handler(Looper.getMainLooper())

        private val DOWNLOAD_SHIM = """
            (function () {
              if (window.__dxDownloads) return;
              window.__dxDownloads = true;
              var port = null;
              addEventListener('message', function (e) {
                if (e.data === 'divinax-download-port' && !e.source && e.ports && e.ports[0]) port = e.ports[0];
              });
              var click = HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click = function () {
                var href = this.href || '';
                if (port && this.hasAttribute('download') && /^(blob|data):/.test(href)) {
                  var name = this.getAttribute('download') || 'download';
                  fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
                    var fr = new FileReader();
                    fr.onload = function () { port.postMessage(JSON.stringify({ name: name, data: fr.result })); };
                    fr.readAsDataURL(b);
                  });
                  return;
                }
                return click.call(this);
              };
            })();
        """.trimIndent()

        private fun runBlocking(block: (FrontActivity) -> Unit): Boolean {
            val a = current?.get() ?: return false
            val latch = CountDownLatch(1)
            main.post {
                try {
                    if (!a.isDestroyed) block(a)
                } finally {
                    latch.countDown()
                }
            }
            latch.await(5, TimeUnit.SECONDS)
            return true
        }

        /** Сохраняет несохранённое во фронте (вызывать не из главного потока). */
        fun flushAll() {
            if (runBlocking { it.flush() }) Thread.sleep(400)
        }

        /** Закрывает встроенное окно перед заменой данных или файлов фронта. */
        fun closeAll() {
            if (runBlocking { it.flush() }) {
                Thread.sleep(500)
                runBlocking {
                    it.web.visibility = View.GONE
                    it.finish()
                }
                Thread.sleep(300)
            }
        }
    }
}
