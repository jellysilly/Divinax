package io.divinax.launcher

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Обновления фронта из GitHub Releases. Сборки публикует workflow web-build.yml:
 * релиз с тегом web-<ветка> содержит divinax-web.zip и version.json.
 */
object Updater {
    private const val API = "https://api.github.com/repos/${BuildConfig.UPDATE_REPO}"

    class Release(
        val channel: String,
        val version: WebInstall.Version?,
        val notes: String,
        val published: String,
        val zipUrl: String,
        val zipSize: Long,
        val htmlUrl: String,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("channel", channel)
            .put("version", version?.toJson() ?: JSONObject.NULL)
            .put("notes", notes)
            .put("published", published)
            .put("size", zipSize)
            .put("url", htmlUrl)
    }

    private fun open(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000
        c.readTimeout = 30_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "DivinaxLauncher/${BuildConfig.VERSION_NAME}")
        if (url.startsWith(API)) c.setRequestProperty("Accept", "application/vnd.github+json")
        return c
    }

    private fun get(url: String): String {
        val c = open(url)
        try {
            val code = c.responseCode
            if (code == 404) throw IOException("не найдено (404)")
            if (code == 403 || code == 429) throw IOException("GitHub ограничил запросы, попробуйте позже")
            if (code !in 200..299) throw IOException("HTTP $code")
            return c.inputStream.use { it.readBytes().decodeToString() }
        } finally {
            c.disconnect()
        }
    }

    /** Ветки, для которых есть собранный фронт. */
    fun channels(): List<String> {
        val arr = JSONArray(get("$API/releases?per_page=100"))
        val out = ArrayList<String>()
        for (i in 0 until arr.length()) {
            val tag = arr.getJSONObject(i).optString("tag_name")
            if (tag.startsWith("web-")) out += tag.removePrefix("web-")
        }
        return out.distinct().sortedWith(compareBy({ it != "main" }, { it }))
    }

    fun latest(channel: String): Release {
        val j = JSONObject(get("$API/releases/tags/web-$channel"))
        val assets = j.optJSONArray("assets") ?: JSONArray()
        var zip: JSONObject? = null
        var ver: JSONObject? = null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            when (a.optString("name")) {
                "divinax-web.zip" -> zip = a
                "version.json" -> ver = a
            }
        }
        if (zip == null) throw IOException("в релизе web-$channel нет divinax-web.zip")
        val version = ver?.let { WebInstall.Version.parse(get(it.getString("browser_download_url"))) }
        return Release(
            channel = channel,
            version = version,
            notes = j.optString("body"),
            published = j.optString("published_at"),
            zipUrl = zip.getString("browser_download_url"),
            zipSize = zip.optLong("size"),
            htmlUrl = j.optString("html_url"),
        )
    }

    /** Скачивает файл; progress(получено, всего). */
    fun download(url: String, dest: File, cancelled: () -> Boolean, progress: (Long, Long) -> Unit) {
        val c = open(url)
        try {
            val code = c.responseCode
            if (code !in 200..299) throw IOException("HTTP $code")
            val total = c.contentLengthLong
            var got = 0L
            var last = 0L
            c.inputStream.use { input ->
                dest.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        if (cancelled()) throw InterruptedException()
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        got += n
                        val now = System.currentTimeMillis()
                        if (now - last > 150) {
                            last = now
                            progress(got, total)
                        }
                    }
                }
            }
            progress(got, total)
        } finally {
            c.disconnect()
        }
    }
}
