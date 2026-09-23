package io.divinax.launcher

import android.content.res.AssetManager
import java.io.BufferedInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.URLDecoder
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Минимальный HTTP-сервер для dist/ — то же, что server.js, только внутри приложения.
 * Слушает только 127.0.0.1. Служебный путь /__launcher__/<токен>/ нужен лаунчеру
 * для бэкапов: страница на том же адресе читает и пишет IndexedDB фронта.
 */
class WebServer(private val root: File, private val openAsset: (String) -> InputStream, val port: Int) {
    constructor(root: File, assets: AssetManager, port: Int) : this(root, { name: String -> assets.open(name) }, port)

    private var socket: ServerSocket? = null
    private var pool: ExecutorService? = null

    fun start() {
        val s = ServerSocket()
        s.reuseAddress = true
        s.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 64)
        socket = s
        val p = Executors.newFixedThreadPool(8)
        pool = p
        Thread({
            while (!s.isClosed) {
                try {
                    val client = s.accept()
                    p.execute { serve(client) }
                } catch (_: SocketException) {
                    break
                } catch (_: IOException) {
                }
            }
        }, "divinax-http").start()
    }

    fun stop() {
        try {
            socket?.close()
        } catch (_: IOException) {
        }
        socket = null
        pool?.shutdownNow()
        pool = null
    }

    private class Request(val method: String, val path: String, val query: String, val headers: Map<String, String>, val body: InputStream)

    private fun serve(client: Socket) {
        client.use { sock ->
            try {
                sock.soTimeout = 30_000
                val input = BufferedInputStream(sock.getInputStream())
                val out = sock.getOutputStream()
                // keep-alive: браузеру так быстрее грузить десятки ассетов
                while (true) {
                    val req = readRequest(input) ?: return
                    val keep = !req.headers["connection"].equals("close", true)
                    handle(req, out, keep)
                    out.flush()
                    if (!keep) return
                }
            } catch (_: IOException) {
            }
        }
    }

    private fun readLine(input: InputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val c = input.read()
            if (c == -1) return if (sb.isEmpty()) null else sb.toString()
            if (c == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(c.toChar())
            if (sb.length > 16 * 1024) throw IOException("Слишком длинная строка")
        }
    }

    private fun readRequest(input: InputStream): Request? {
        var line = readLine(input) ?: return null
        while (line.isEmpty()) line = readLine(input) ?: return null
        val parts = line.split(' ')
        if (parts.size < 2) return null
        val headers = HashMap<String, String>()
        while (true) {
            val h = readLine(input) ?: break
            if (h.isEmpty()) break
            val i = h.indexOf(':')
            if (i > 0) headers[h.substring(0, i).trim().lowercase()] = h.substring(i + 1).trim()
        }
        val target = parts[1]
        val q = target.indexOf('?')
        val rawPath = if (q >= 0) target.substring(0, q) else target
        val path = try {
            URLDecoder.decode(rawPath.replace("+", "%2B"), "UTF-8")
        } catch (_: IllegalArgumentException) {
            rawPath
        }
        val len = headers["content-length"]?.toLongOrNull() ?: 0L
        return Request(parts[0].uppercase(), path, if (q >= 0) target.substring(q + 1) else "", headers, LimitedInput(input, len))
    }

    private fun handle(req: Request, out: OutputStream, keep: Boolean) {
        if (req.path.startsWith("/__launcher__/")) {
            handleBridge(req, out, keep)
            return
        }
        if (req.method != "GET" && req.method != "HEAD") {
            drain(req.body)
            send(out, 405, "text/plain", "Method Not Allowed".toByteArray(), keep)
            return
        }
        val rootPath = root.canonicalPath
        var file = File(root, req.path).canonicalFile
        if (file.path != rootPath && !file.path.startsWith(rootPath + File.separator)) {
            send(out, 403, "text/plain", ByteArray(0), keep)
            return
        }
        if (!file.isFile) file = File(root, "index.html")
        if (!file.isFile) {
            send(out, 503, "text/html; charset=utf-8", "<h1>Фронт не установлен</h1>".toByteArray(), keep)
            return
        }
        val immutable = file.path.startsWith(File(root, "assets").path + File.separator)
        val headers = linkedMapOf(
            "Content-Type" to type(file.name),
            "Content-Length" to file.length().toString(),
            // шрифты и картинки нужны и HTML-фреймам сообщений (у них нулевой origin)
            "Access-Control-Allow-Origin" to "*",
            "Cache-Control" to if (immutable) "public, max-age=31536000, immutable" else "no-cache",
        )
        writeHead(out, 200, headers, keep)
        if (req.method == "GET") file.inputStream().use { it.copyTo(out, 64 * 1024) }
    }

    private fun handleBridge(req: Request, out: OutputStream, keep: Boolean) {
        val rest = req.path.removePrefix("/__launcher__/")
        val token = rest.substringBefore('/')
        val name = rest.substringAfter('/', "")
        val op = Bridge.current
        if (op == null || token != op.token) {
            drain(req.body)
            send(out, 404, "text/plain", ByteArray(0), keep)
            return
        }
        when {
            name == "idb.html" && req.method == "GET" -> {
                val bytes = openAsset("launcher/idb.html").use { it.readBytes() }
                send(out, 200, "text/html; charset=utf-8", bytes, keep)
            }
            name == "data" && req.method == "GET" -> {
                val f = op.input
                if (f == null || !f.isFile) {
                    send(out, 404, "text/plain", ByteArray(0), keep)
                } else {
                    writeHead(out, 200, linkedMapOf("Content-Type" to "application/json", "Content-Length" to f.length().toString(), "Cache-Control" to "no-store"), keep)
                    f.inputStream().use { it.copyTo(out, 64 * 1024) }
                }
            }
            name == "data" && req.method == "POST" -> {
                val f = op.output
                if (f == null) {
                    drain(req.body)
                    send(out, 404, "text/plain", ByteArray(0), keep)
                } else {
                    f.outputStream().use { req.body.copyTo(it, 64 * 1024) }
                    send(out, 200, "text/plain", "ok".toByteArray(), keep)
                }
            }
            else -> {
                drain(req.body)
                send(out, 404, "text/plain", ByteArray(0), keep)
            }
        }
    }

    private fun drain(input: InputStream) {
        val buf = ByteArray(8192)
        while (input.read(buf) > 0) Unit
    }

    private fun send(out: OutputStream, code: Int, type: String, body: ByteArray, keep: Boolean) {
        writeHead(out, code, linkedMapOf("Content-Type" to type, "Content-Length" to body.size.toString(), "Cache-Control" to "no-store"), keep)
        out.write(body)
    }

    private fun writeHead(out: OutputStream, code: Int, headers: Map<String, String>, keep: Boolean) {
        val sb = StringBuilder("HTTP/1.1 $code ${reason(code)}\r\n")
        headers.forEach { (k, v) -> sb.append(k).append(": ").append(v).append("\r\n") }
        sb.append("Connection: ").append(if (keep) "keep-alive" else "close").append("\r\n\r\n")
        out.write(sb.toString().toByteArray(Charsets.UTF_8))
    }

    private fun reason(code: Int) = when (code) {
        200 -> "OK"
        403 -> "Forbidden"
        404 -> "Not Found"
        405 -> "Method Not Allowed"
        else -> "Service Unavailable"
    }

    /** Тело запроса ровно по Content-Length, чтобы не съесть следующий запрос в keep-alive. */
    private class LimitedInput(private val input: InputStream, private var left: Long) : InputStream() {
        override fun read(): Int {
            if (left <= 0) return -1
            val c = input.read()
            if (c >= 0) left--
            return c
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (left <= 0) return -1
            val n = input.read(b, off, minOf(len.toLong(), left).toInt())
            if (n > 0) left -= n
            return n
        }
    }

    companion object {
        private val TYPES = mapOf(
            "html" to "text/html; charset=utf-8",
            "js" to "text/javascript; charset=utf-8",
            "mjs" to "text/javascript; charset=utf-8",
            "css" to "text/css; charset=utf-8",
            "json" to "application/json",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "webp" to "image/webp",
            "gif" to "image/gif",
            "svg" to "image/svg+xml",
            "ico" to "image/x-icon",
            "woff" to "font/woff",
            "woff2" to "font/woff2",
            "ttf" to "font/ttf",
            "txt" to "text/plain; charset=utf-8",
            "mp3" to "audio/mpeg",
            "wav" to "audio/wav",
            "mp4" to "video/mp4",
            "webm" to "video/webm",
            "wasm" to "application/wasm",
        )

        fun type(name: String) = TYPES[name.substringAfterLast('.', "").lowercase()] ?: "application/octet-stream"
    }
}

/** Текущая служебная операция лаунчера с IndexedDB (одна за раз). */
object Bridge {
    class Op(val token: String, val input: File?, val output: File?)

    @Volatile
    var current: Op? = null
}
