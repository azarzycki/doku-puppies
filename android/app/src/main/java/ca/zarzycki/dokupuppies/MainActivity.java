package ca.zarzycki.dokupuppies;

import android.app.Activity;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

/**
 * Full-screen WebView around the hosted game (GitHub Pages). The page itself ships the whole game,
 * so content updates land on next launch without a new APK. Works with touch (phones, tablets) and
 * with a D-pad / remote (Android TV, Google TV) because the page handles arrow keys.
 */
public class MainActivity extends Activity {
    private WebView web;
    private String url;
    private boolean offline = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        url = getString(R.string.game_url);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // progress lives in localStorage (+ cloud sync)
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // service worker keeps the game playable offline
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);
        web.setBackgroundColor(0xFFFFF3E4);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return false; // stay inside the WebView for every link
            }
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) showOffline();
            }
            @Override
            public void onPageFinished(WebView v, String u) { offline = false; }
        });

        // Apps targeting Android 15+ are drawn edge-to-edge: keep the page out from under the status /
        // navigation bars and display cutouts by padding a container (the gap shows the page colour).
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFFFFF3E4);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);

        // Predictive back (Android 13+, on by default when targeting 16): the system no longer sends
        // KEYCODE_BACK, it invokes this callback instead. Older devices and TV remotes use onKeyDown.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState); else web.loadUrl(url);
    }

    private void showOffline() {
        offline = true;
        String html = "<html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head>"
                + "<body style='background:#fff3e4;color:#3f2f2a;font-family:sans-serif;display:flex;align-items:center;"
                + "justify-content:center;height:100vh;margin:0;text-align:center'><div><div style='font-size:64px'>🐶</div>"
                + "<h1 style='color:#ff8a5b'>Can't reach the kennel</h1><p>Check the internet connection.<br>"
                + "<button onclick=\"location.href='" + url + "'\" style='font-size:18px;padding:12px 24px;border:0;border-radius:999px;"
                + "background:#ff8a5b;color:#fff;margin-top:12px'>Try again</button><br><small>(or press OK on the remote)</small></p></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /** Let the page close a dialog or go back a screen first; leave the app only from the home screen. */
    private void back() {
        web.evaluateJavascript("(window.dokuPuppies && window.dokuPuppies.handleBack) ? String(window.dokuPuppies.handleBack()) : 'false'", value -> {
            if (!"\"true\"".equals(value)) {
                if (web.canGoBack() && !offline) web.goBack(); else finish();
            }
        });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if ((keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) && offline) {
            web.loadUrl(url);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            back();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
