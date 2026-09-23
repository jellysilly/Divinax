package io.divinax.launcher

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.Socket
import java.net.URL
import java.nio.file.Files

class WebServerTest {
    private lateinit var root: File
    private lateinit var server: WebServer
    private val port = 18765
    private val base = "http://127.0.0.1:$port"

    @Before
    fun setUp() {
        root = Files.createTempDirectory("dist").toFile()
        File(root, "index.html").writeText("<h1>index</h1>")
        File(root, "assets").mkdirs()
        File(root, "assets/app.js").writeText("console.log(1)")
        server = WebServer(root, { name: String -> "asset:$name".byteInputStream() }, port)
        server.start()
    }

    @After
    fun tearDown() {
        server.stop()
        Bridge.current = null
        root.deleteRecursively()
    }

    private fun get(path: String): Triple<Int, String, HttpURLConnection> {
        val c = URL(base + path).openConnection() as HttpURLConnection
        val code = c.responseCode
        val body = (if (code < 400) c.inputStream else c.errorStream)?.use { it.readBytes().decodeToString() } ?: ""
        return Triple(code, body, c)
    }

    @Test
    fun servesFilesAndSpaFallback() {
        val (code, body, c) = get("/assets/app.js")
        assertEquals(200, code)
        assertEquals("console.log(1)", body)
        assertTrue(c.getHeaderField("Content-Type").startsWith("text/javascript"))
        assertTrue(c.getHeaderField("Cache-Control").contains("immutable"))
        val (code2, body2, c2) = get("/chat/123?x=1")
        assertEquals(200, code2)
        assertEquals("<h1>index</h1>", body2)
        assertEquals("no-cache", c2.getHeaderField("Cache-Control"))
    }

    @Test
    fun blocksTraversal() {
        File(root.parentFile, "secret-${root.name}.txt").apply { writeText("secret") }.also { f ->
            Socket("127.0.0.1", port).use { s ->
                s.getOutputStream().write("GET /../${f.name} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n".toByteArray())
                val resp = s.getInputStream().readBytes().decodeToString()
                assertTrue(!resp.contains("secret"))
            }
            f.delete()
        }
    }

    @Test
    fun keepAliveServesSeveralRequests() {
        Socket("127.0.0.1", port).use { s ->
            val out = s.getOutputStream()
            out.write("GET /assets/app.js HTTP/1.1\r\nHost: x\r\n\r\nGET /index.html HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n".toByteArray())
            val resp = s.getInputStream().readBytes().decodeToString()
            assertTrue(resp.contains("console.log(1)"))
            assertTrue(resp.contains("<h1>index</h1>"))
        }
    }

    @Test
    fun bridgeNeedsToken() {
        val input = File(root.parentFile, "in-${root.name}.json").apply { writeText("{\"a\":1}") }
        val output = File(root.parentFile, "out-${root.name}.json")
        assertEquals(404, get("/__launcher__/abc/idb.html").first)
        Bridge.current = Bridge.Op("tok", input, output)
        assertEquals(404, get("/__launcher__/wrong/data").first)
        val (code, body, _) = get("/__launcher__/tok/idb.html")
        assertEquals(200, code)
        assertEquals("asset:launcher/idb.html", body)
        assertEquals("{\"a\":1}", get("/__launcher__/tok/data").second)
        val c = URL("$base/__launcher__/tok/data").openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.doOutput = true
        c.outputStream.use { it.write("{\"state\":{}}".toByteArray()) }
        assertEquals(200, c.responseCode)
        assertEquals("{\"state\":{}}", output.readText())
        input.delete()
        output.delete()
    }
}
