package ca.zarzycki.dokupuppies;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Full-screen WebView around the hosted game (GitHub Pages). The page itself ships the whole game,
 * so content updates land on next launch without a new APK. Works with touch (phones, tablets) and
 * with a D-pad / remote (Android TV, Google TV) because the page handles arrow keys.
 *
 * A copy of the web files is bundled in the APK (assets/www, filled by Gradle from the repo root). It is
 * only used when the live page cannot be loaded at all — a first launch with no network, or a cleared cache —
 * and it is served under the live site's own URL, so saved progress, the service worker scope and the cloud
 * sync key are the same whichever copy is running. Once the live page loads again, its service worker takes
 * over as before.
 *
 * Before the live URL is loaded, {@link Preflight} fetches the page and checks it really is ours. On a Wi‑Fi
 * network behind a captive portal every request is answered with the portal's sign-in page; without the check the
 * WebView would render it and keep it in its history and HTTP cache under the game's URL. In that case the bundled
 * copy plays instead and every request that is not bundled is refused, so nothing from the portal gets in.
 */
public class MainActivity extends Activity {
    private static final String BUNDLED_PREFIX = "www/";
    private static final int PREFLIGHT_MS = 5000;
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "text/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("svg", "image/svg+xml"); MIME.put("png", "image/png");
        MIME.put("webmanifest", "application/manifest+json"); MIME.put("txt", "text/plain");
    }

    private WebView web;
    private String url;
    private String siteHost, sitePath; // the live site's host and base path, from game_url
    private boolean offline = false;   // the "can't reach the kennel" page is showing
    private volatile boolean bundled = false; // same-origin requests are being answered from the bundled copy (read on WebView threads)
    private volatile boolean portal = false;  // the network answers with someone else's page: requests that are not bundled are refused
    private final Handler main = new Handler(Looper.getMainLooper());
    private int loadSeq = 0;           // a preflight that finishes after a newer load was asked for is ignored

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        url = getString(R.string.game_url);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            // debug builds only: the emulator test (android/emulator-test) points the app at a server on the host
            String override = getIntent().getStringExtra("url");
            if (override != null && !override.isEmpty()) url = override;
        }
        Uri site = Uri.parse(url);
        siteHost = site.getHost();
        sitePath = site.getPath() == null || site.getPath().isEmpty() ? "/" : site.getPath();
        if (!sitePath.endsWith("/")) sitePath += "/";
        if (savedInstanceState != null) {
            bundled = savedInstanceState.getBoolean("bundled", false);
            portal = savedInstanceState.getBoolean("portal", false);
        }

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
                // "Try again" on the offline page: check the network again before the live page is loaded
                if (offline && r.isForMainFrame() && isSitePage(r.getUrl())) { startLoad(); return true; }
                return false; // stay inside the WebView for every link
            }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return bundled ? bundledResponse(r.getUrl()) : null;
            }
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                // the live page is unreachable and no service worker answered: fall back to the copy in the APK
                if (!bundled && isSitePage(r.getUrl())) loadBundled(); else showOffline();
            }
            @Override
            public void onPageFinished(WebView v, String u) { offline = false; }
        });
        // Requests made by the service worker (its own script, and fetches from inside it) do not pass through the
        // WebViewClient above: behind a captive portal they are refused here instead, so the worker falls back to its
        // cache and the portal's page never reaches it either.
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) { return portal ? refused() : null; }
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

        if (savedInstanceState != null) web.restoreState(savedInstanceState); else startLoad();
    }

    /**
     * Load the game: ask the live site for its page first (off the main thread) and only point the WebView at the
     * live URL when the reply is really our page. Otherwise the bundled copy plays, and a captive portal's answers
     * are shut out until the next launch.
     */
    private void startLoad() {
        final int seq = ++loadSeq;
        offline = false;
        new Thread(() -> {
            final Preflight.Verdict v = Preflight.check(url, PREFLIGHT_MS);
            main.post(() -> {
                if (seq != loadSeq || isFinishing() || isDestroyed()) return;
                switch (v) {
                    case OURS:
                        bundled = false; portal = false;
                        web.loadUrl(url);
                        break;
                    case PORTAL:
                        portal = true;
                        Toast.makeText(MainActivity.this, R.string.portal_notice, Toast.LENGTH_LONG).show();
                        loadBundled();
                        break;
                    default: // offline, or the site is down: the bundled copy (or the service worker's cache) plays
                        portal = false;
                        loadBundled();
                }
            });
        }, "preflight").start();
    }

    /** true for a URL on the live site (any page under its base path) */
    private boolean isSitePage(Uri u) {
        return u != null && siteHost.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith(sitePath);
    }

    /** Serve the live page from the copy bundled in the APK, under its own URL. */
    private void loadBundled() {
        bundled = true;
        offline = false;
        web.loadUrl(url);
    }

    /**
     * The bundled file for a same-origin request, or null to let it go to the network (other hosts, and
     * anything not shipped in the APK). The page's own history.pushState hashes never reach here.
     */
    private WebResourceResponse bundledResponse(Uri u) {
        if (!isSitePage(u)) return portal ? refused() : null;
        String rel = u.getPath().substring(sitePath.length());
        if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
        String ext = rel.contains(".") ? rel.substring(rel.lastIndexOf('.') + 1).toLowerCase() : "";
        String mime = MIME.get(ext);
        if (mime == null) return null;
        try {
            InputStream in = getAssets().open(BUNDLED_PREFIX + rel);
            boolean text = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml");
            WebResourceResponse res = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            res.setResponseHeaders(headers);
            return res;
        } catch (IOException e) {
            return portal ? refused() : null; // not bundled: try the network, unless a portal would answer in its place
        }
    }

    /** An empty 503 for a request that must not reach a captive portal (the page treats it like being offline). */
    private WebResourceResponse refused() {
        return new WebResourceResponse("text/plain", "utf-8", 503, "Service Unavailable", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
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
            startLoad();
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
        out.putBoolean("bundled", bundled);
        out.putBoolean("portal", portal);
        web.saveState(out);
    }
}
