package com.villabridge.android

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * Villa Bridge'in Android kabugu yalnizca ince istemcidir. Ev otomasyonu Raspberry Pi'deki
 * sunucuda calisir; bu Activity o sunucunun HTTPS panelini tam ekran gosterir ve tablete ait
 * ekran/parlaklik yeteneklerini kontrollu bir JavaScript koprusuyle sunar.
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var loadingStatus: TextView
    private lateinit var loadingPanel: LinearLayout
    private val mainHandler = Handler(Looper.getMainLooper())
    private val dashboardOrigin = Uri.parse(DASHBOARD_URL)
    private var pageLoaded = false
    private var destroyed = false
    private var pendingGeolocationCallback: GeolocationPermissions.Callback? = null
    private var pendingGeolocationOrigin: String? = null
    @Volatile private var screenPolicy = ScreenPolicy.DEFAULT

    private val retryDashboard = Runnable {
        if (!destroyed && !pageLoaded) loadDashboard()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        screenPolicy = ScreenPolicyStore.load(this)
        if (!SystemBrightness.canWrite(this)) applyScreenPolicyNow(screenPolicy)
        applyOrientationLock()
        setContentView(R.layout.activity_main)
        enterImmersiveMode()

        webView = findViewById(R.id.dashboard)
        loadingStatus = findViewById(R.id.loading_status)
        loadingPanel = findViewById(R.id.client_connecting)
        configureWebView()
        loadDashboard()
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
        if (!pageLoaded) {
            mainHandler.removeCallbacks(retryDashboard)
            mainHandler.post(retryDashboard)
        }
    }

    override fun onPause() {
        if (screenPolicy.dimmed) applyScreenPolicyNow(screenPolicy.copy(dimmed = false))
        super.onPause()
    }

    @Deprecated("Android back dispatch remains compatible with the app's minSdk")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        destroyed = true
        pendingGeolocationCallback?.invoke(pendingGeolocationOrigin, false, false)
        pendingGeolocationCallback = null
        pendingGeolocationOrigin = null
        mainHandler.removeCallbacksAndMessages(null)
        webView.removeJavascriptInterface("VillaAndroid")
        webView.destroy()
        super.onDestroy()
    }

    private fun applyScreenPolicyNow(policy: ScreenPolicy) {
        screenPolicy = policy
        val level = policy.effective
        val wroteSystemValue = SystemBrightness.apply(this, level)
        val attributes = window.attributes
        attributes.screenBrightness = if (wroteSystemValue || level < 0) {
            WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        } else {
            (level / 100f).coerceIn(0.02f, 1f)
        }
        window.attributes = attributes
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.setGeolocationEnabled(true)
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) webView.settings.safeBrowsingEnabled = true
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        webView.addJavascriptInterface(AndroidBridge(), "VillaAndroid")
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            enqueueDownload(url, userAgent, contentDisposition, mimeType)
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                val line = "${message.message()} (${message.sourceId()}:${message.lineNumber()})"
                when (message.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.e(TAG, line)
                    ConsoleMessage.MessageLevel.WARNING -> Log.w(TAG, line)
                    else -> Log.i(TAG, line)
                }
                return true
            }

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
                requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION_PERMISSION_REQUEST)
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (request.isForMainFrame && isTrustedDashboard(uri)) return false
                if (request.isForMainFrame && (uri.scheme == "https" || uri.scheme == "http")) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }

            override fun onPageCommitVisible(view: WebView, url: String) {
                if (!isTrustedDashboard(Uri.parse(url))) return
                pageLoaded = true
                mainHandler.removeCallbacks(retryDashboard)
                loadingPanel.visibility = View.GONE
                webView.visibility = View.VISIBLE
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) showConnectionFailure()
            }
        }
    }

    private fun loadDashboard() {
        if (destroyed) return
        pageLoaded = false
        loadingStatus.setText(R.string.client_connecting_message)
        loadingPanel.visibility = View.VISIBLE
        webView.visibility = View.INVISIBLE
        webView.loadUrl(DASHBOARD_URL)
    }

    private fun showConnectionFailure() {
        pageLoaded = false
        webView.visibility = View.INVISIBLE
        loadingPanel.visibility = View.VISIBLE
        loadingStatus.setText(R.string.client_retrying_message)
        mainHandler.removeCallbacks(retryDashboard)
        mainHandler.postDelayed(retryDashboard, RETRY_MS)
    }

    private fun enqueueDownload(
        url: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?
    ) {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return
        if (!isTrustedDashboard(uri)) return
        val name = runCatching { URLUtil.guessFileName(url, contentDisposition, mimeType) }
            .getOrDefault("villa-yedek.zip")
        val request = DownloadManager.Request(uri)
            .setTitle(name)
            .setMimeType(mimeType)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
        userAgent?.let { request.addRequestHeader("User-Agent", it) }
        val started = runCatching {
            (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        }.isSuccess
        Toast.makeText(
            this,
            if (started) R.string.download_started else R.string.download_failed,
            Toast.LENGTH_LONG
        ).show()
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

    private fun isTrustedDashboard(uri: Uri): Boolean =
        uri.scheme == dashboardOrigin.scheme && uri.host == dashboardOrigin.host && uri.port == dashboardOrigin.port

    private fun applyOrientationLock() {
        if (!resources.getBoolean(R.bool.lock_portrait_orientation) || isInMultiWindowMode) return
        runCatching { requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT }
    }

    private fun enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
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
        fun openWifiSettings() {
            runOnUiThread { startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).apply { data = Uri.EMPTY }) }
        }

        @android.webkit.JavascriptInterface
        fun clientMode(): String = "thin-client"

        @android.webkit.JavascriptInterface
        fun connectedServerAddress(): String = dashboardOrigin.host.orEmpty()

        @android.webkit.JavascriptInterface
        fun hostStatus(): String {
            val systemWritable = SystemBrightness.canWrite(this@MainActivity)
            val screen = screenPolicy.toJson()
                .put("systemWritable", systemWritable)
                .put("automatic", SystemBrightness.automatic(this@MainActivity))
                .put("currentBrightness", if (systemWritable) SystemBrightness.current(this@MainActivity) else -1)
            return JSONObject().put("thinClient", true).put("screen", screen).toString()
        }

        @android.webkit.JavascriptInterface
        fun applyScreenPolicy(policy: String) {
            val parsed = ScreenPolicy.fromJson(policy) ?: return
            runOnUiThread {
                ScreenPolicyStore.save(this@MainActivity, parsed)
                applyScreenPolicyNow(parsed)
            }
        }

        @android.webkit.JavascriptInterface
        fun requestSystemBrightnessPermission() {
            runOnUiThread {
                val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
                    .setData(Uri.parse("package:$packageName"))
                runCatching { startActivity(intent) }
                    .onFailure { runCatching { startActivity(Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)) } }
            }
        }
    }

    companion object {
        private const val TAG = "VillaPanel"
        private const val DASHBOARD_URL = "https://home.drascom.uk/"
        private const val RETRY_MS = 5_000L
        private const val LOCATION_PERMISSION_REQUEST = 2002
    }
}
