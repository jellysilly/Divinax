package io.divinax.launcher

import android.content.Context
import android.content.SharedPreferences
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/** Настройки лаунчера. Порт фиксирован: данные фронта в IndexedDB привязаны к адресу. */
class Prefs(context: Context) {
    private val sp: SharedPreferences = context.applicationContext.getSharedPreferences("launcher", Context.MODE_PRIVATE)

    var autostart by bool("autostart", true)
    var openAfterStart by bool("openAfterStart", true)
    var bootStart by bool("bootStart", false)
    var checkOnLaunch by bool("checkOnLaunch", true)
    var openInApp by bool("openInApp", true)
    var backupKeys by bool("backupKeys", false)
    var channel by string("channel", "main")
    var theme by string("theme", "dark")
    var lastCheck by long("lastCheck", 0L)
    var lastBackup by long("lastBackup", 0L)
    var notifAsked by bool("notifAsked", false)

    /** Для JS: какие ключи можно менять из интерфейса. */
    fun set(key: String, value: String) {
        when (key) {
            "autostart" -> autostart = value == "true"
            "openAfterStart" -> openAfterStart = value == "true"
            "bootStart" -> bootStart = value == "true"
            "checkOnLaunch" -> checkOnLaunch = value == "true"
            "openInApp" -> openInApp = value == "true"
            "backupKeys" -> backupKeys = value == "true"
            "channel" -> channel = value
            "theme" -> theme = value
        }
    }

    private fun bool(key: String, def: Boolean) = object : ReadWriteProperty<Any?, Boolean> {
        override fun getValue(thisRef: Any?, property: KProperty<*>) = sp.getBoolean(key, def)
        override fun setValue(thisRef: Any?, property: KProperty<*>, value: Boolean) = sp.edit().putBoolean(key, value).apply()
    }

    private fun string(key: String, def: String) = object : ReadWriteProperty<Any?, String> {
        override fun getValue(thisRef: Any?, property: KProperty<*>) = sp.getString(key, def) ?: def
        override fun setValue(thisRef: Any?, property: KProperty<*>, value: String) = sp.edit().putString(key, value).apply()
    }

    private fun long(key: String, def: Long) = object : ReadWriteProperty<Any?, Long> {
        override fun getValue(thisRef: Any?, property: KProperty<*>) = sp.getLong(key, def)
        override fun setValue(thisRef: Any?, property: KProperty<*>, value: Long) = sp.edit().putLong(key, value).apply()
    }

    companion object {
        const val PORT = 8000
        const val URL = "http://127.0.0.1:$PORT"
    }
}
