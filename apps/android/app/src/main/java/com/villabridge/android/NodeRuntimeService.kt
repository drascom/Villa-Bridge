package com.villabridge.android

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class NodeRuntimeService : Service() {
    private var multicastLock: WifiManager.MulticastLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val healthExecutor = Executors.newSingleThreadScheduledExecutor()
    private val destroyed = AtomicBoolean(false)
    private val runtimeStarted = AtomicBoolean(false)
    private val healthScheduled = AtomicBoolean(false)
    private val deliberateStop = AtomicBoolean(false)

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, notification(getString(R.string.service_starting)))
        acquireLocks()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (
            intent?.action == ACTION_STOP ||
            RuntimeStateStore.desired(this) == RuntimeStateStore.DesiredState.STOPPED
        ) {
            requestStop()
            return START_NOT_STICKY
        }
        startRuntime()
        return START_STICKY
    }

    private fun startRuntime() {
        if (!runtimeStarted.compareAndSet(false, true)) return
        deliberateStop.set(false)
        healthExecutor.execute {
            val startAccepted = runCatching {
                NodeRuntime.start(this, RuntimeStateStore.controlToken(this), ::handleRuntimeExit)
            }
                .onFailure {
                    Log.e(TAG, "Villa Bridge core failed to start", it)
                    showStatus(getString(R.string.service_error))
                }
                .isSuccess

            if (
                startAccepted &&
                !destroyed.get() &&
                healthScheduled.compareAndSet(false, true)
            ) {
                healthExecutor.scheduleWithFixedDelay(
                    ::refreshHealth,
                    2,
                    10,
                    TimeUnit.SECONDS
                )
            }
        }
    }

    private fun requestStop() {
        if (!deliberateStop.compareAndSet(false, true)) return
        RuntimeStateStore.setDesired(this, RuntimeStateStore.DesiredState.STOPPED)
        showStatus(getString(R.string.service_stopping))
        healthExecutor.execute {
            if (runtimeStarted.get()) {
                runCatching { requestGracefulShutdown() }
                    .onFailure { Log.w(TAG, "Graceful runtime shutdown request failed", it) }
            }
        }
        Handler(Looper.getMainLooper()).postDelayed(::finishDeliberateStop, STOP_TIMEOUT_MS)
    }

    private fun requestGracefulShutdown() {
        val connection = URI(SHUTDOWN_URL).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 1_500
            connection.readTimeout = 2_500
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty(
                "Authorization",
                "Bearer ${RuntimeStateStore.controlToken(this)}"
            )
            connection.setFixedLengthStreamingMode(0)
            connection.outputStream.use { }
            check(connection.responseCode == HttpURLConnection.HTTP_ACCEPTED) {
                "Runtime rejected shutdown with HTTP ${connection.responseCode}"
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun finishDeliberateStop() {
        if (!deliberateStop.get()) return
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Handler(Looper.getMainLooper()).postDelayed(
            { android.os.Process.killProcess(android.os.Process.myPid()) },
            100
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        destroyed.set(true)
        healthExecutor.shutdownNow()
        multicastLock?.takeIf { it.isHeld }?.release()
        wifiLock?.takeIf { it.isHeld }?.release()
        wakeLock?.takeIf { it.isHeld }?.release()
        super.onDestroy()
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireLocks() {
        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifiManager.createMulticastLock("villa-bridge-matter").apply {
            setReferenceCounted(false)
            acquire()
        }
        @Suppress("DEPRECATION")
        wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "villa-bridge-wifi").apply {
            setReferenceCounted(false)
            acquire()
        }
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VillaBridge::Core").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun refreshHealth() {
        if (NodeRuntime.state == NodeRuntime.State.FAILED) {
            showStatus(getString(R.string.service_error))
            return
        }
        val healthy = runCatching {
            val connection = URI("http://127.0.0.1:8091/api/health").toURL()
                .openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 1_500
                connection.readTimeout = 1_500
                connection.requestMethod = "GET"
                connection.responseCode == HttpURLConnection.HTTP_OK
            } finally {
                connection.disconnect()
            }
        }.getOrDefault(false)
        if (healthy) NodeRuntime.markRunning()
        showStatus(getString(if (healthy) R.string.service_running else R.string.service_starting))
    }

    private fun handleRuntimeExit(result: Int) {
        if (destroyed.get()) return
        if (
            deliberateStop.get() ||
            RuntimeStateStore.desired(this) == RuntimeStateStore.DesiredState.STOPPED
        ) {
            Log.i(TAG, "Villa Bridge core stopped with code $result")
            Handler(Looper.getMainLooper()).post(::finishDeliberateStop)
            return
        }
        Log.e(TAG, "Villa Bridge core exited unexpectedly with code $result")
        showStatus(getString(R.string.service_error))

        val storage = createDeviceProtectedStorageContext()
        val preferences = storage.getSharedPreferences(RESTART_PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val windowStarted = preferences.getLong(RESTART_WINDOW_STARTED, 0L)
        val previousCount = if (now - windowStarted <= RESTART_WINDOW_MS) {
            preferences.getInt(RESTART_COUNT, 0)
        } else {
            0
        }
        val count = previousCount + 1
        preferences.edit()
            .putLong(RESTART_WINDOW_STARTED, if (previousCount == 0) now else windowStarted)
            .putInt(RESTART_COUNT, count)
            .apply()
        if (count > MAX_RESTARTS_PER_WINDOW) {
            Log.e(TAG, "Runtime restart suppressed after $count exits in one minute")
            stopSelf()
            return
        }
        Handler(Looper.getMainLooper()).postDelayed(
            { android.os.Process.killProcess(android.os.Process.myPid()) },
            1_000
        )
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.service_channel_name),
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun showStatus(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification(text))
    }

    private fun notification(text: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(R.drawable.ic_villa_bridge)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    companion object {
        private const val TAG = "VillaCoreService"
        private const val CHANNEL_ID = "villa_bridge_core"
        private const val NOTIFICATION_ID = 81
        private const val RESTART_PREFS = "villa_runtime_restart"
        private const val RESTART_WINDOW_STARTED = "window_started"
        private const val RESTART_COUNT = "restart_count"
        private const val RESTART_WINDOW_MS = 60_000L
        private const val MAX_RESTARTS_PER_WINDOW = 3
        private const val STOP_TIMEOUT_MS = 6_000L
        private const val SHUTDOWN_URL = "http://127.0.0.1:8092/api/android/runtime/shutdown"
        private const val ACTION_START = "com.villabridge.android.action.START_RUNTIME"
        private const val ACTION_STOP = "com.villabridge.android.action.STOP_RUNTIME"

        fun start(context: Context) {
            RuntimeStateStore.setDesired(context, RuntimeStateStore.DesiredState.RUNNING)
            startServiceCommand(context, ACTION_START)
        }

        fun stop(context: Context) {
            RuntimeStateStore.setDesired(context, RuntimeStateStore.DesiredState.STOPPED)
            startServiceCommand(context, ACTION_STOP)
        }

        private fun startServiceCommand(context: Context, action: String) {
            val intent = Intent(context, NodeRuntimeService::class.java).setAction(action)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
