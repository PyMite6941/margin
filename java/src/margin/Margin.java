package margin;

import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.concurrent.Worker;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.scene.web.WebEngine;
import javafx.scene.web.WebView;
import javafx.stage.FileChooser;
import javafx.stage.Stage;
import netscape.javascript.JSObject;

// Java desktop shell. Loads the built web app (dist/) in a WebView and gives it the same
// window.desktop bridge as the Electron shell (desktop/preload.cjs): native open and save
// dialogs, plus request() so an AI provider can be called without browser CORS limits.
// Everything else lives in src/ and is shared with the web build.
@SuppressWarnings("removal")   // netscape.javascript.JSObject: still the only WebView bridge in JavaFX 25
public class Margin extends Application {
    private static final String SHIM = """
        (() => {
          const j = window.javaBridge, waiting = new Map();
          let next = 0;
          const call = fn => new Promise((ok, fail) => setTimeout(() => {
            try { const r = JSON.parse(fn()); r && r.error ? fail(new Error(r.error)) : ok(r); } catch (e) { fail(e); }
          }));
          const exts = f => (f || []).flatMap(x => x.extensions).join(',');
          window.__javaReply = (id, json) => {
            const p = waiting.get(id), r = JSON.parse(json);
            waiting.delete(id);
            r.error ? p.fail(new Error(r.error)) : p.ok(r);
          };
          window.desktop = {
            open: f => call(() => j.open(exts(f))),
            save: r => call(() => j.save(r.path || '', r.name || '', r.text, exts(r.filters))),
            request: r => new Promise((ok, fail) => {
              const id = String(++next);
              waiting.set(id, { ok, fail });
              j.request(id, r.method || 'POST', r.url, Object.entries(r.headers || {}).flat().join('\\n'), r.body || '');
            }),
            env: {
              read: () => call(() => j.readEnv()),
              write: text => call(() => j.writeEnv(text)),
              reveal: () => call(() => j.revealEnv()),
            },
          };
          dispatchEvent(new Event('desktop-ready'));
        })();
        """;

    private Stage stage;
    private WebEngine engine;
    private final Bridge bridge = new Bridge();   // held here so it is not garbage collected
    private final Set<Path> granted = new HashSet<>();   // paths the user picked; the page may only write to these
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NORMAL).build();

    public static void main(String[] args) { launch(args); }

    // The web build sits in a "web" folder next to margin.jar, or wherever -Dmargin.web points.
    private static Path webDir() throws Exception {
        String override = System.getProperty("margin.web");
        if (override != null) return Path.of(override).toAbsolutePath();
        Path jar = Path.of(Margin.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        return jar.getParent().resolve("web");
    }

    @Override
    public void start(Stage stage) throws Exception {
        this.stage = stage;
        Path web = webDir();
        Path index = web.resolve("index.html");
        if (!Files.exists(index)) throw new IllegalStateException("No web build at " + web + ". Run npm run build first.");

        WebView view = new WebView();
        engine = view.getEngine();
        // Margin's own pages are the files in the web build. Only they get the bridge (and with
        // it the .env file), and the window never leaves them: anything else goes to the browser.
        Path home = web.toAbsolutePath().normalize();
        engine.locationProperty().addListener((o, was, url) -> {
            if (url == null || url.isEmpty() || inside(url, home)) return;
            openOutside(url, home);
            Platform.runLater(() -> engine.load(was != null && inside(was, home) ? was : index.toUri().toString()));
        });
        // A fixed data folder keeps documents (localStorage) between launches.
        engine.setUserDataDirectory(Path.of(System.getProperty("user.home"), ".margin", "webview").toFile());
        engine.getLoadWorker().stateProperty().addListener((o, was, now) -> {
            if (now == Worker.State.SUCCEEDED && inside(engine.getLocation(), home)) {
                ((JSObject) engine.executeScript("window")).setMember("javaBridge", bridge);
                engine.executeScript(SHIM);
            }
        });
        // Every link the page opens (target=_blank) goes to the system browser.
        engine.setCreatePopupHandler(features -> {
            WebEngine temp = new WebEngine();
            temp.locationProperty().addListener((o, was, url) -> {
                if (url == null || url.isEmpty()) return;
                openOutside(url, home);
                Platform.runLater(() -> temp.load(null));
            });
            return temp;
        });
        engine.titleProperty().addListener((o, was, title) -> stage.setTitle(title == null ? "Margin" : title));

        Path icon = web.resolve("icon-512.png");
        if (Files.exists(icon)) stage.getIcons().add(new Image(icon.toUri().toString()));
        stage.setTitle("Margin");
        stage.setScene(new Scene(view, 1280, 820));
        stage.show();
        engine.load(index.toUri().toString());
    }

    // Web and mail links, and the guide that ships with the build. Not other files or schemes,
    // which the system could treat as programs to run.
    private void openOutside(String url, Path home) {
        if (url.matches("(?i)(https?|mailto):.*")) getHostServices().showDocument(url);
        else if (inside(url, home)) getHostServices().showDocument(url.endsWith("/") ? url + "index.html" : url);
    }

    // Whether url is a file in the web build. Compared as paths, since WebKit reports the
    // address percent-encoded (the build may sit in a folder with non-ASCII characters).
    private static boolean inside(String url, Path home) {
        try {
            URI u = URI.create(url);
            return "file".equalsIgnoreCase(u.getScheme()) && Path.of(u).toAbsolutePath().normalize().startsWith(home);
        } catch (Exception notAFile) { return false; }
    }

    private static FileChooser chooser(String title, String extensions) {
        FileChooser fc = new FileChooser();
        fc.setTitle(title);
        if (!extensions.isBlank()) {
            fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("Text",
                Arrays.stream(extensions.split(",")).map(e -> "*." + e).toList()));
        }
        return fc;
    }

    private static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
            }
        }
        return b.append('"').toString();
    }

    private static String error(Exception e) { return "{\"error\":" + json(String.valueOf(e.getMessage())) + "}"; }

    // Called from JavaScript on the FX thread. Public so the WebView can see the methods.
    public class Bridge {
        public String open(String extensions) {
            try {
                File file = chooser("Open", extensions).showOpenDialog(stage);
                if (file == null) return "null";
                Path p = file.toPath().toAbsolutePath();
                granted.add(p);
                return "{\"path\":" + json(p.toString()) + ",\"name\":" + json(p.getFileName().toString())
                    + ",\"text\":" + json(Files.readString(p, StandardCharsets.UTF_8)) + "}";
            } catch (Exception e) { return error(e); }
        }

        public String save(String wanted, String name, String text, String extensions) {
            try {
                Path p = wanted.isEmpty() ? null : Path.of(wanted).toAbsolutePath();
                if (p == null || !granted.contains(p)) {
                    FileChooser fc = chooser("Save", extensions);
                    if (p != null && p.getParent() != null && Files.isDirectory(p.getParent())) fc.setInitialDirectory(p.getParent().toFile());
                    fc.setInitialFileName(p != null ? p.getFileName().toString() : name);
                    File file = fc.showSaveDialog(stage);
                    if (file == null) return "null";
                    p = file.toPath().toAbsolutePath();
                    granted.add(p);
                }
                Files.writeString(p, text, StandardCharsets.UTF_8);
                return "{\"path\":" + json(p.toString()) + ",\"name\":" + json(p.getFileName().toString()) + "}";
            } catch (Exception e) { return error(e); }
        }

        // The AI accounts' .env file (src/lib/keys.js): ~/.margin/.env, the only file the page
        // can reach without a dialog. Owner-only permissions where the file system has them.
        private Path envFile() { return Path.of(System.getProperty("user.home"), ".margin", ".env"); }

        public String readEnv() {
            try {
                Path p = envFile();
                String text = Files.exists(p) ? Files.readString(p, StandardCharsets.UTF_8) : "";
                return "{\"path\":" + json(p.toString()) + ",\"text\":" + json(text) + "}";
            } catch (Exception e) { return error(e); }
        }

        public synchronized String writeEnv(String text) {
            try {
                if (text == null || text.length() > 1_000_000) throw new IllegalArgumentException("Not a .env file");
                Path p = envFile();
                Files.createDirectories(p.getParent());
                // A new owner-only file renamed over the old one: never half written, never readable by others.
                Path temp = p.resolveSibling(".env." + ProcessHandle.current().pid() + ".tmp");
                Files.deleteIfExists(temp);
                try {
                    Files.createFile(temp, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")));
                } catch (UnsupportedOperationException windows) {
                    Files.createFile(temp);   // Windows: the user folder is already private
                }
                try {
                    Files.writeString(temp, text, StandardCharsets.UTF_8);
                    Files.move(temp, p, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
                } finally { Files.deleteIfExists(temp); }
                return "{\"path\":" + json(p.toString()) + "}";
            } catch (Exception e) { return error(e); }
        }

        public String revealEnv() {
            try {
                getHostServices().showDocument(envFile().getParent().toUri().toString());
                return "{}";
            } catch (Exception e) { return error(e); }
        }

        // Answers through window.__javaReply(id, json) so the window stays responsive while waiting.
        public void request(String id, String method, String url, String headers, String body) {
            try {
                if (!url.matches("(?i)https?://.+")) throw new IllegalArgumentException("Only http and https addresses are allowed");
                HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(5));
                String[] h = headers.isEmpty() ? new String[0] : headers.split("\n");
                for (int i = 0; i + 1 < h.length; i += 2) req.header(h[i], h[i + 1]);
                req.method(method, body.isEmpty() ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
                http.sendAsync(req.build(), HttpResponse.BodyHandlers.ofString()).whenComplete((res, err) -> {
                    String out = err != null ? error(new Exception(err.getCause() != null ? err.getCause().toString() : err.toString()))
                        : "{\"status\":" + res.statusCode() + ",\"text\":" + json(res.body()) + "}";
                    Platform.runLater(() -> reply(id, out));
                });
            } catch (Exception e) { reply(id, error(e)); }
        }

        private void reply(String id, String out) {
            ((JSObject) engine.executeScript("window")).call("__javaReply", id, out);
        }
    }
}
