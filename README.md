# Margin

A quiet text editor for the browser and the desktop. Documents are saved on your own device as you type; nothing is uploaded and there is no account.

- **Use it in a browser:** https://pymite6941.github.io/margin/
- **Guide:** https://pymite6941.github.io/margin/docs/

## Run it

| How | What to do |
| --- | --- |
| In a browser, any device | Open https://pymite6941.github.io/margin/. Nothing to install. It keeps working offline after the first visit, and Chrome, Edge and phones offer "Install" to add it as an app |
| Desktop app | Run the install command for your system below, or download from [Releases](https://github.com/PyMite6941/margin/releases/latest) |
| From source | `git clone https://github.com/PyMite6941/margin && cd margin && npm install && npm run desktop` (needs Node.js 20 or newer) |

### Install the desktop app

**Windows** (PowerShell):

```powershell
curl.exe -L -o "$env:TEMP\Margin-Setup.exe" https://github.com/PyMite6941/margin/releases/latest/download/Margin-Setup.exe; & "$env:TEMP\Margin-Setup.exe"
```

**Debian, Ubuntu, Raspberry Pi OS** (x86-64 and ARM64). This installs the app with everything it needs and adds it to the applications menu:

```sh
curl -L -o /tmp/margin.deb "https://github.com/PyMite6941/margin/releases/latest/download/Margin-$(dpkg --print-architecture).deb" && sudo apt install -y /tmp/margin.deb
```

Then run `margin` or pick Margin from the menu. Remove it with `sudo apt remove margin`.

**Other Linux** (portable AppImage, nothing installed system-wide):

```sh
curl -L -o Margin.AppImage "https://github.com/PyMite6941/margin/releases/latest/download/Margin-$(uname -m | sed s/aarch64/arm64/).AppImage"
chmod +x Margin.AppImage
./Margin.AppImage --appimage-extract-and-run
```

`--appimage-extract-and-run` makes it work on systems without FUSE 2 (most current distributions); with `libfuse2` installed you can leave it off and it starts faster.

**macOS:** download `Margin-arm64.dmg` from [Releases](https://github.com/PyMite6941/margin/releases/latest), open it and drag the app to Applications.

The installers are not code-signed yet. If Windows shows a SmartScreen prompt, choose More info, then Run anyway; on macOS, right-click the app and choose Open the first time.

## What it does

- A sidebar of documents with search; the first line is the title
- Write, Split and Read views with a Markdown preview
- Focus mode, light and dark themes, three typefaces, adjustable text size and line width
- Find and replace
- Lists that continue on Enter, Tab to indent, Ctrl+B and Ctrl+I
- Opens and saves `.md`, `.markdown` and `.txt` files; drag a file in to open it
- Word count, reading time and cursor position

## Develop

Needs Node.js 20 or newer.

```sh
npm install
npm run dev          # web app with live reload, http://localhost:5173
npm run build        # static site in dist/
npm run desktop      # build, then open the desktop app
npm run desktop:dev  # desktop app pointed at the dev server (run `npm run dev` first)
npm run package      # build an installer into release/ (downloads electron-builder on first use)
```

To publish installers for every system, push a version tag (bump `version` in `package.json`, then `git tag v0.2.0 && git push --tags`). `.github/workflows/release.yml` builds them and attaches them to a GitHub release. Code signing is not set up yet; it goes in the `build` section of `package.json`.

## How it is put together

One React app, two shells. The web build is what GitHub Pages serves. The desktop app is Electron loading that same build and adding native file dialogs.

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | State and layout: documents, preferences, toolbar, status bar |
| `src/components/Editor.jsx` | The textarea and its keyboard behaviour |
| `src/components/Sidebar.jsx` | Document list and search |
| `src/lib/files.js` | Opening and saving files. **Add new file types here** |
| `src/lib/storage.js` | Documents and preferences in `localStorage` |
| `src/lib/editing.js` | Bold/italic wrapping, indenting, list continuation, find and replace |
| `src/lib/markdown.js` | The Markdown renderer behind the preview |
| `desktop/main.cjs` | Electron window, `app://` file server, open and save handlers |
| `desktop/preload.cjs` | The `window.desktop` bridge the page uses on desktop |
| `public/docs/` | User guide, published alongside the app |
| `public/sw.js`, `src/lib/offline.js` | Offline support and install for the web version |
| `public/icon.svg`, `build/icon.png` | App icon (web and installers) |
| `.github/workflows/pages.yml` | Builds and deploys to GitHub Pages on every push to `main` |
| `.github/workflows/release.yml` | Builds desktop installers when a `v*` tag is pushed |

`src/lib/files.js` picks the best backend available: `window.desktop` in the desktop app, the File System Access API in Chrome and Edge, and upload/download elsewhere. Nothing outside that file knows which one is in use.

The desktop app can only write to paths the user chose in a dialog during that session (see `granted` in `desktop/main.cjs`).

## License

MIT. See [LICENSE](LICENSE).
