# Methods called from JavaScript through addJavascriptInterface must keep their names.
-keepclassmembers class io.github.gmonet.vintedbundlesearch.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
