package io.divinax.launcher

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CopyOnWriteArrayList

/** Журнал лаунчера: в памяти и в файле, переживает перезапуск. */
object Journal {
    class Entry(val time: Long, val text: String, val accent: Boolean)

    private const val MAX = 400
    private val entries = ArrayList<Entry>()
    private var file: File? = null
    val listeners = CopyOnWriteArrayList<() -> Unit>()

    fun init(context: Context) {
        if (file != null) return
        val f = File(context.filesDir, "journal.tsv")
        file = f
        if (f.isFile) {
            f.readLines().takeLast(MAX).forEach { line ->
                val parts = line.split('\t', limit = 3)
                if (parts.size == 3) entries += Entry(parts[0].toLongOrNull() ?: 0L, parts[2].replace("\\n", "\n"), parts[1] == "1")
            }
        }
    }

    /** accent — строка со звёздочкой в журнале (важные события). */
    fun add(text: String, accent: Boolean = false) {
        val e = Entry(System.currentTimeMillis(), text, accent)
        synchronized(this) {
            entries += e
            if (entries.size > MAX) entries.subList(0, entries.size - MAX).clear()
            try {
                file?.let { f ->
                    f.appendText("${e.time}\t${if (accent) 1 else 0}\t${text.replace("\n", "\\n")}\n")
                    if (f.length() > 256 * 1024) f.writeText(entries.joinToString("") { "${it.time}\t${if (it.accent) 1 else 0}\t${it.text.replace("\n", "\\n")}\n" })
                }
            } catch (_: Exception) {
            }
        }
        listeners.forEach { it() }
    }

    fun clear() {
        synchronized(this) {
            entries.clear()
            file?.delete()
        }
        listeners.forEach { it() }
    }

    fun since(time: Long): List<Entry> = synchronized(this) { entries.filter { it.time >= time } }

    fun toJson(limit: Int = 200): JSONArray = synchronized(this) {
        JSONArray().apply {
            entries.takeLast(limit).forEach { put(JSONObject().put("t", it.time).put("text", it.text).put("a", it.accent)) }
        }
    }

    fun asText(): String = synchronized(this) {
        val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        entries.joinToString("\n") { "${fmt.format(Date(it.time))}  ${it.text}" }
    }
}
