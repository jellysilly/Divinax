package io.divinax.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.net.BindException
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Держит сервер фронта в фоне (foreground-сервис с уведомлением),
 * поэтому лаунчер можно свернуть или закрыть — фронт продолжит работать.
 */
class FrontService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Journal.add("Сервер остановлен из уведомления")
            shutdown(this)
            return START_NOT_STICKY
        }
        goForeground()
        if (server == null && !starting) {
            starting = true
            notifyChanged()
            Thread {
                try {
                    startServer(applicationContext)
                } finally {
                    starting = false
                    notifyChanged()
                }
                if (server == null) stopSelf()
            }.start()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopServer()
        super.onDestroy()
    }

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Сервер фронта", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Пока уведомление висит, Divinax доступен по ${Prefs.URL}"
            setShowBadge(false)
        })
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val open = PendingIntent.getActivity(this, 1, openIntent(this), flags)
        val launcher = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT), flags)
        val stop = PendingIntent.getService(this, 3, Intent(this, FrontService::class.java).setAction(ACTION_STOP), flags)
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_star)
            .setContentTitle("Divinax работает")
            .setContentText(Prefs.URL)
            .setContentIntent(launcher)
            .setOngoing(true)
            .setShowWhen(false)
            .addAction(Notification.Action.Builder(null, "Открыть", open).build())
            .addAction(Notification.Action.Builder(null, "Остановить", stop).build())
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION_ID, n)
    }

    companion object {
        private const val CHANNEL = "front"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_START = "start"
        private const val ACTION_STOP = "stop"

        @Volatile
        var server: WebServer? = null
            private set

        @Volatile
        var starting = false
            private set

        @Volatile
        var startedAt = 0L
            private set

        /** Ошибка последнего запуска (например, порт занят Termux-сервером). */
        @Volatile
        var lastError: String? = null
            private set

        val listeners = CopyOnWriteArrayList<() -> Unit>()
        val running get() = server != null

        private fun notifyChanged() = listeners.forEach { it() }

        fun start(ctx: Context) {
            lastError = null
            ctx.startForegroundService(Intent(ctx, FrontService::class.java).setAction(ACTION_START))
        }

        /** Останавливает сервер сразу (синхронно) и снимает сервис. */
        fun shutdown(ctx: Context) {
            stopServer()
            ctx.stopService(Intent(ctx, FrontService::class.java))
        }

        @Synchronized
        private fun startServer(ctx: Context) {
            if (server != null) return
            try {
                if (!WebInstall.ensureInstalled(ctx)) {
                    lastError = "Фронт не установлен — нажмите «Обновить»"
                    Journal.add(lastError!!)
                    return
                }
                Journal.add("Запуск сервера фронта на порту ${Prefs.PORT}")
                val s = WebServer(WebInstall.current(ctx), ctx.assets, Prefs.PORT)
                s.start()
                server = s
                startedAt = System.currentTimeMillis()
                Journal.add("Сервер слушает ${Prefs.URL}", accent = true)
            } catch (e: BindException) {
                lastError = "Порт ${Prefs.PORT} занят — возможно, запущен сервер в Termux"
                Journal.add(lastError!!)
            } catch (e: Exception) {
                lastError = "Не удалось запустить: ${e.message}"
                Journal.add(lastError!!)
            }
        }

        @Synchronized
        private fun stopServer() {
            val s = server ?: return
            s.stop()
            server = null
            startedAt = 0L
            Journal.add("Сервер остановлен", accent = true)
            notifyChanged()
        }

        /**
         * Временный сервер для служебных операций (бэкап, сброс), когда фронт остановлен.
         * Возвращает функцию, которая его погасит (или ничего не делает, если сервер уже работал).
         */
        @Synchronized
        fun ensureServerFor(ctx: Context): () -> Unit {
            if (server != null) return {}
            val dir = WebInstall.current(ctx).apply { mkdirs() }
            val s = WebServer(dir, ctx.assets, Prefs.PORT)
            s.start()
            return { s.stop() }
        }

        /** Куда вести по «Открыть»: встроенное окно или браузер. */
        fun openIntent(ctx: Context): Intent =
            if (Prefs(ctx).openInApp) Intent(ctx, FrontActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            else Intent(Intent.ACTION_VIEW, android.net.Uri.parse(Prefs.URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}
