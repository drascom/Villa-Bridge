package com.villabridge.android

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var loadingStatus: TextView
    private lateinit var startingPanel: LinearLayout
    private lateinit var stoppedPanel: LinearLayout
    private lateinit var startRuntimeButton: Button
    private val mainHandler = Handler(Looper.getMainLooper())
    private val probeExecutor = Executors.newSingleThreadExecutor()
    private val serverProbePending = AtomicBoolean(false)
    private var pageLoaded = false
    @Volatile private var trustedDashboardOrigin = Uri.parse(DASHBOARD_URL)
    @Volatile private var runtimeMode = "starting"
    private var pendingGeolocationCallback: GeolocationPermissions.Callback? = null
    private var pendingGeolocationOrigin: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        enterImmersiveMode()
        requestNotificationPermission()

        webView = findViewById(R.id.dashboard)
        loadingStatus = findViewById(R.id.loading_status)
        startingPanel = findViewById(R.id.runtime_starting)
        stoppedPanel = findViewById(R.id.runtime_stopped)
        startRuntimeButton = findViewById(R.id.start_runtime)
        startRuntimeButton.setOnClickListener { startRuntime() }
        configureWebView()
        synchronizeRuntimeUi(startService = true)
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
        synchronizeRuntimeUi(startService = false)
    }

    override fun onDestroy() {
        pendingGeolocationCallback?.invoke(pendingGeolocationOrigin, false, false)
        pendingGeolocationCallback = null
        pendingGeolocationOrigin = null
        mainHandler.removeCallbacksAndMessages(null)
        probeExecutor.shutdownNow()
        webView.destroy()
        super.onDestroy()
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.setGeolocationEnabled(true)
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.settings.safeBrowsingEnabled = true
        }
        webView.addJavascriptInterface(AndroidBridge(), "VillaAndroid")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                if (!isTrustedDashboard(Uri.parse(origin))) {
                    callback.invoke(origin, false, false)
                    return
                }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false)
                    return
                }
                pendingGeolocationCallback?.invoke(pendingGeolocationOrigin, false, false)
                pendingGeolocationCallback = callback
                pendingGeolocationOrigin = origin
                requestPermissions(
                    arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION),
                    LOCATION_PERMISSION_REQUEST
                )
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (request.isForMainFrame && isTrustedDashboard(uri)) return false
                if (
                    request.isForMainFrame &&
                    (uri.scheme == "https" || uri.scheme == "http")
                ) {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                }
                return true
            }

            override fun onPageCommitVisible(view: WebView, url: String) {
                val uri = Uri.parse(url)
                if (isTrustedDashboard(uri)) {
                    pageLoaded = true
                    startingPanel.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    pageLoaded = false
                    webView.visibility = View.INVISIBLE
                    showStartingUi()
                    waitForLocalServer()
                }
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != LOCATION_PERMISSION_REQUEST) return
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        pendingGeolocationCallback?.invoke(pendingGeolocationOrigin, granted, false)
        pendingGeolocationCallback = null
        pendingGeolocationOrigin = null
    }

    private fun waitForLocalServer() {
        if (
            RuntimeStateStore.desired(this) != RuntimeStateStore.DesiredState.RUNNING ||
            pageLoaded ||
            probeExecutor.isShutdown ||
            !serverProbePending.compareAndSet(false, true)
        ) return
        probeExecutor.execute {
            val probe = probeRuntime()
            mainHandler.postDelayed(
                {
                    serverProbePending.set(false)
                    if (
                        RuntimeStateStore.desired(this) != RuntimeStateStore.DesiredState.RUNNING
                    ) {
                        showStoppedUi()
                    } else if (probe.ready && !pageLoaded) {
                        loadingStatus.setText(R.string.runtime_stage_dashboard)
                        runtimeMode = probe.mode ?: "android-standalone"
                        val dashboardUrl = probe.dashboardUrl ?: DASHBOARD_URL
                        trustedDashboardOrigin = Uri.parse(dashboardUrl)
                        webView.loadUrl(dashboardUrl)
                    } else {
                        loadingStatus.setText(probe.stage)
                        waitForLocalServer()
                    }
                },
                if (probe.ready) 0 else 750
            )
        }
    }

    private fun probeRuntime(): RuntimeProbe {
        val diagnostics = runCatching { readJson(DIAGNOSTICS_URL) }.getOrNull()
        if (diagnostics != null) {
            val provisioning = diagnostics.optJSONObject("provisioning")
            val mqtt = diagnostics.optJSONObject("mqtt")
            val core = diagnostics.optJSONObject("core")
            val matter = diagnostics.optJSONObject("matter")
            val mode = diagnostics.optString("mode")
            val monitorMode = mode == "android-monitor"
            val dashboardUrl = validatedDashboardUrl(
                diagnostics.optJSONObject("endpoints")?.optString("dashboard")
            )
            val stage = when {
                monitorMode -> R.string.runtime_stage_dashboard
                provisioning?.optBoolean("provisioned") != true ->
                    R.string.runtime_stage_configuration
                mqtt?.optBoolean("listening") != true || mqtt?.optBoolean("selfTest") != true ->
                    R.string.runtime_stage_mqtt
                core?.optBoolean("ready") != true -> R.string.runtime_stage_zigbee
                matter?.optBoolean("ready") != true -> R.string.runtime_stage_matter
                else -> R.string.runtime_stage_dashboard
            }
            return RuntimeProbe(diagnostics.optBoolean("ready"), stage, dashboardUrl, mode)
        }

        val dashboardReady = runCatching {
            val connection = URI(HEALTH_URL).toURL().openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 800
                connection.readTimeout = 800
                connection.responseCode == HttpURLConnection.HTTP_OK
            } finally {
                connection.disconnect()
            }
        }.getOrDefault(false)
        return RuntimeProbe(
            dashboardReady,
            if (dashboardReady) R.string.runtime_stage_dashboard else R.string.runtime_stage_preparing,
            if (dashboardReady) DASHBOARD_URL else null,
            if (dashboardReady) "android-standalone" else null
        )
    }

    private fun validatedDashboardUrl(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            val uri = URI(value)
            check(uri.scheme == "http")
            check(uri.host?.isNotBlank() == true)
            check(uri.userInfo == null)
            check(uri.port in 1..65535)
            uri.resolve("/").toString()
        }.getOrNull()
    }

    private fun readJson(url: String): JSONObject {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 800
            connection.readTimeout = 800
            check(connection.responseCode == HttpURLConnection.HTTP_OK)
            return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally {
            connection.disconnect()
        }
    }

    private fun synchronizeRuntimeUi(startService: Boolean) {
        if (RuntimeStateStore.desired(this) == RuntimeStateStore.DesiredState.STOPPED) {
            showStoppedUi()
            return
        }
        showStartingUi()
        if (startService) NodeRuntimeService.start(this)
        waitForLocalServer()
    }

    private fun showStartingUi() {
        stoppedPanel.visibility = View.GONE
        if (!pageLoaded) {
            webView.visibility = View.INVISIBLE
            startingPanel.visibility = View.VISIBLE
        }
    }

    private fun showStoppedUi() {
        runtimeMode = "stopped"
        pageLoaded = false
        webView.visibility = View.INVISIBLE
        startingPanel.visibility = View.GONE
        stoppedPanel.visibility = View.VISIBLE
        startRuntimeButton.isEnabled = true
    }

    private fun startRuntime() {
        startRuntimeButton.isEnabled = false
        runtimeMode = "starting"
        RuntimeStateStore.setDesired(this, RuntimeStateStore.DesiredState.RUNNING)
        pageLoaded = false
        loadingStatus.setText(R.string.runtime_stage_preparing)
        showStartingUi()
        NodeRuntimeService.start(this)
        waitForLocalServer()
    }

    private fun stopRuntime() {
        RuntimeStateStore.setDesired(this, RuntimeStateStore.DesiredState.STOPPED)
        showStoppedUi()
        NodeRuntimeService.stop(this)
    }

    private fun isTrustedDashboard(uri: Uri): Boolean {
        val trusted = trustedDashboardOrigin
        return uri.scheme == trusted.scheme &&
            uri.host == trusted.host &&
            uri.port == trusted.port
    }

    private fun requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 81)
        }
    }

    private fun enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        }
    }

    inner class AndroidBridge {
        @android.webkit.JavascriptInterface
        fun openPowerSettings() {
            runOnUiThread {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        }

        @android.webkit.JavascriptInterface
        fun reload() {
            runOnUiThread { webView.reload() }
        }

        @android.webkit.JavascriptInterface
        fun openWifiSettings() {
            runOnUiThread {
                startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).apply { data = Uri.EMPTY })
            }
        }

        @android.webkit.JavascriptInterface
        fun runtimeStatus(): String =
            if (RuntimeStateStore.desired(this@MainActivity) == RuntimeStateStore.DesiredState.STOPPED) {
                "stopped"
            } else {
                runtimeMode
            }

        @android.webkit.JavascriptInterface
        fun connectedServerAddress(): String =
            if (runtimeMode == "android-monitor") trustedDashboardOrigin.host.orEmpty() else ""

        @android.webkit.JavascriptInterface
        fun startRuntime() {
            runOnUiThread { this@MainActivity.startRuntime() }
        }

        @android.webkit.JavascriptInterface
        fun stopRuntime() {
            runOnUiThread { this@MainActivity.stopRuntime() }
        }
    }

    companion object {
        private data class RuntimeProbe(
            val ready: Boolean,
            val stage: Int,
            val dashboardUrl: String?,
            val mode: String?
        )

        private const val DASHBOARD_URL = "http://127.0.0.1:8091/"
        private const val HEALTH_URL = "http://127.0.0.1:8091/api/health"
        private const val DIAGNOSTICS_URL = "http://127.0.0.1:8092/api/android/diagnostics"
        private const val LOCATION_PERMISSION_REQUEST = 2002
    }
}
