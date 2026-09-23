package io.divinax.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** «Запускать лаунчер вместе с системой»: поднимает сервер фронта после загрузки телефона. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!Prefs(context).bootStart) return
        Launcher.init(context)
        Journal.add("Автозапуск после загрузки системы")
        try {
            FrontService.start(context)
        } catch (e: Exception) {
            Journal.add("Автозапуск не удался: ${e.message}")
        }
    }
}
