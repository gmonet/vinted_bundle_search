package io.github.gmonet.vintedbundlesearch

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.widget.FrameLayout
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * A WebView on www.vinted.fr into which the web bundle (assets/vbs.js, built from src/) is
 * injected after each page load. Requests to the Vinted API are therefore made by the real site
 * context (cookies, anti-bot), exactly like the desktop userscript.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val bundle: String by lazy { assets.open("vbs.js").bufferedReader().use { it.readText() } }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        WebView.setWebContentsDebuggingEnabled(debuggable)

        web = WebView(this)
        // WebView ignores its own padding: insets are applied to a parent container.
        val root = FrameLayout(this).apply { addView(web) }
        setContentView(root)
        applySystemBarInsets(root)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // Look like regular mobile Chrome: the "; wv" marker can trigger extra anti-bot checks.
            userAgentString = userAgentString.replace("; wv)", ")")
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }
        web.addJavascriptInterface(Bridge(this), Bridge.NAME)
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (isVintedPage(url)) return false
                openExternal(url.toString())
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (isVintedPage(Uri.parse(url))) view.evaluateJavascript(bundle, null)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                val target = request.url.toString().takeIf { isVintedPage(request.url) } ?: HOME
                view.loadDataWithBaseURL(null, offlinePage(target, error.description.toString()), "text/html", "utf-8", null)
            }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(HOME)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Still the simplest cross-version back handling without AndroidX")
    override fun onBackPressed() {
        // Let the web UI close its modal/panel first, then navigate back in the WebView.
        web.evaluateJavascript("window.__vbs ? window.__vbs.handleBack() : false") { handled ->
            when {
                handled == "true" -> Unit
                web.canGoBack() -> web.goBack()
                else -> finish()
            }
        }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    fun openExternal(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme != "http" && uri.scheme != "https") return
        // Opens the Vinted app if installed (app links), otherwise the browser.
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }

    fun shareText(text: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        runCatching { startActivity(Intent.createChooser(send, getString(R.string.share_export))) }
    }

    private fun applySystemBarInsets(root: FrameLayout) {
        // targetSdk 35 draws edge-to-edge: keep the page out of the status/navigation bars.
        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight, insets.systemWindowInsetBottom,
                )
            }
            insets
        }
    }

    private fun offlinePage(retryUrl: String, reason: String): String {
        val esc = { t: String -> t.replace("&", "&amp;").replace("<", "&lt;").replace("\"", "&quot;") }
        return """<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
            <body style="font-family:sans-serif;padding:24px;text-align:center;color-scheme:light dark">
            <h2>Vinted est inaccessible</h2><p>Vérifie ta connexion internet.</p>
            <p style="opacity:.6;font-size:12px">${esc(reason)}</p>
            <p><a href="${esc(retryUrl)}" style="display:inline-block;padding:12px 24px;background:#007782;
            color:#fff;border-radius:8px;text-decoration:none">Réessayer</a></p></body>"""
    }

    companion object {
        const val HOME = "https://www.vinted.fr/"

        fun isVintedPage(uri: Uri): Boolean {
            val host = uri.host ?: return false
            return (uri.scheme == "https") && (host == "vinted.fr" || host.endsWith(".vinted.fr"))
        }
    }
}
