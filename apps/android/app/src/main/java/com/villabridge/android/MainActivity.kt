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
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var loadingStatus: TextView
    private lateinit var stoppedPanel: LinearLayout
    private lateinit var startRuntimeButton: Button
    private val mainHandler = Handler(Looper.getMainLooper())
    private val probeExecutor = Executors.newSingleThreadExecutor()
    private val serverProbePending = AtomicBoolean(false)
    private var pageLoaded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        enterImmersiveMode()
        requestNotificationPermission()

        webView = findViewById(R.id.dashboard)
        loadingStatus = findViewById(R.id.loading_status)
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
        mainHandler.removeCallbacksAndMessages(null)
        probeExecutor.shutdownNow()
        webView.destroy()
        super.onDestroy()
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.settings.safeBrowsingEnabled = true
        }
        webView.addJavascriptInterface(AndroidBridge(), "VillaAndroid")
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
                    loadingStatus.visibility = View.GONE
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
                    loadingStatus.visibility = View.VISIBLE
                    waitForLocalServer()
                }
            }
        }
    }

    private fun waitForLocalServer() {
        if (
            RuntimeStateStore.desired(this) != RuntimeStateStore.DesiredState.RUNNING ||
            pageLoaded ||
            probeExecutor.isShutdown ||
            !serverProbePending.compareAndSet(false, true)
        ) return
        probeExecutor.execute {
            val ready = runCatching {
                val connection = URI(HEALTH_URL).toURL().openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 800
                    connection.readTimeout = 800
                    connection.responseCode == HttpURLConnection.HTTP_OK
                } finally {
                    connection.disconnect()
                }
            }.getOrDefault(false)
            mainHandler.postDelayed(
                {
                    serverProbePending.set(false)
                    if (
                        RuntimeStateStore.desired(this) != RuntimeStateStore.DesiredState.RUNNING
                    ) {
                        showStoppedUi()
                    } else if (ready && !pageLoaded) {
                        webView.loadUrl(DASHBOARD_URL)
                    }
                    else waitForLocalServer()
                },
                if (ready) 0 else 750
            )
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
            loadingStatus.visibility = View.VISIBLE
        }
    }

    private fun showStoppedUi() {
        pageLoaded = false
        webView.visibility = View.INVISIBLE
        loadingStatus.visibility = View.GONE
        stoppedPanel.visibility = View.VISIBLE
        startRuntimeButton.isEnabled = true
    }

    private fun startRuntime() {
        startRuntimeButton.isEnabled = false
        RuntimeStateStore.setDesired(this, RuntimeStateStore.DesiredState.RUNNING)
        showStartingUi()
        NodeRuntimeService.start(this)
        waitForLocalServer()
    }

    private fun stopRuntime() {
        RuntimeStateStore.setDesired(this, RuntimeStateStore.DesiredState.STOPPED)
        showStoppedUi()
        NodeRuntimeService.stop(this)
    }

    private fun isTrustedDashboard(uri: Uri): Boolean =
        uri.scheme == "http" &&
            uri.host == "127.0.0.1" &&
            uri.port == 8091

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
            RuntimeStateStore.desired(this@MainActivity).name.lowercase()

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
        private const val DASHBOARD_URL = "http://127.0.0.1:8091/"
        private const val HEALTH_URL = "http://127.0.0.1:8091/api/health"
    }
}
