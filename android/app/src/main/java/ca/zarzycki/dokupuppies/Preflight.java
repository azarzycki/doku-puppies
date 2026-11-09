package ca.zarzycki.dokupuppies;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Asks the live site for the page before the WebView is pointed at it, and says what came back. A Wi‑Fi network
 * behind a captive portal answers every request with its own sign-in page (200 OK, text/html, or a redirect to the
 * portal's host); rendering that would put the portal in the game's history and HTTP cache, so the page is only
 * loaded when the reply is really ours. Plain Java (no Android classes) so it can be exercised from a desktop JVM.
 */
final class Preflight {
    /** index.html carries this meta tag; the service worker checks for the same one (sw.js). */
    static final String PAGE_MARKER = "<meta name=\"doku-puppies\"";
    private static final int MAX_BYTES = 512 * 1024;

    enum Verdict {
        OURS,        // the live page answered: load it
        PORTAL,      // something else answered with a web page or a redirect: a captive portal or a hijacking proxy
        UNREACHABLE  // no usable answer: offline, timed out, TLS failure, server error, not HTML
    }

    private Preflight() {}

    static Verdict check(String url, int timeoutMs) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false); // a redirect is a portal's doing: the site never redirects its own page
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            c.setUseCaches(false);
            c.setRequestProperty("Accept", "text/html");
            c.setRequestProperty("Cache-Control", "no-cache");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) return Verdict.PORTAL;
            String type = c.getContentType();
            boolean html = type != null && type.toLowerCase().startsWith("text/html");
            if (code < 200 || code >= 300 || !html) return Verdict.UNREACHABLE;
            return readUpTo(c.getInputStream(), MAX_BYTES).contains(PAGE_MARKER) ? Verdict.OURS : Verdict.PORTAL;
        } catch (IOException | RuntimeException e) {
            return Verdict.UNREACHABLE;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String readUpTo(InputStream in, int max) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n;
        while (buf.size() < max && (n = in.read(b)) > 0) buf.write(b, 0, n);
        in.close();
        return new String(buf.toByteArray(), StandardCharsets.UTF_8);
    }

    /** desktop check: java Preflight.java <url> */
    public static void main(String[] args) {
        long t = System.currentTimeMillis();
        System.out.println(check(args[0], 5000) + " in " + (System.currentTimeMillis() - t) + " ms");
    }
}
