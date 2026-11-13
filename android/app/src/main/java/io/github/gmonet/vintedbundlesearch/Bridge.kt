package io.github.gmonet.vintedbundlesearch

import android.webkit.JavascriptInterface
import java.io.File

/**
 * JS bridge exposed as `window.VbsAndroid` (see src/platform.ts).
 *
 * Storage lives in the app's private files rather than in the vinted.fr localStorage, so the
 * search history survives clearing Vinted cookies/site data. Only vinted.fr pages are loaded in
 * the WebView (other links open externally), and keys are sanitized to a flat directory.
 */
class Bridge(private val activity: MainActivity) {

    private val dir = File(activity.filesDir, "store").apply { mkdirs() }

    private fun fileFor(key: String): File {
        val safe = key.replace(Regex("[^A-Za-z0-9._-]"), "_").take(100)
        return File(dir, "$safe.json")
    }

    @JavascriptInterface
    fun getItem(key: String): String? = fileFor(key).takeIf { it.exists() }?.readText()

    @JavascriptInterface
    fun setItem(key: String, value: String) {
        val target = fileFor(key)
        val tmp = File(dir, "${target.name}.tmp")
        tmp.writeText(value)
        tmp.renameTo(target) // atomic replace
    }

    @JavascriptInterface
    fun removeItem(key: String) {
        fileFor(key).delete()
    }

    @JavascriptInterface
    fun openExternal(url: String) = activity.runOnUiThread { activity.openExternal(url) }

    @JavascriptInterface
    fun share(text: String) = activity.runOnUiThread { activity.shareText(text) }

    @JavascriptInterface
    fun appVersion(): String =
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""

    companion object {
        const val NAME = "VbsAndroid"
    }
}
