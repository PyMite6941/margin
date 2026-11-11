# Margin

A quiet text editor for the browser and the desktop. Documents are saved on your own device as you type; nothing is uploaded and there is no account.

- **Use it in a browser:** https://pymite6941.github.io/margin/
- **Guide:** https://pymite6941.github.io/margin/docs/

## Run it

| How | What to do |
| --- | --- |
| In a browser, any device | Open https://pymite6941.github.io/margin/. Nothing to install |
| Desktop app | Download the installer for your system from [Releases](https://github.com/PyMite6941/margin/releases/latest): `.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux |
| From source | `npm install`, then `npm run desktop` |

The installers are not code-signed yet. Windows shows a SmartScreen prompt (More info, Run anyway); on macOS, right-click the app and choose Open the first time. On Linux, make the AppImage executable (`chmod +x Margin-*.AppImage`) and run it.

## What it does

- A sidebar of documents with search; the first line is the title
- Write, Split and Read views with a Markdown preview
- Focus mode, light and dark themes, three typefaces, adjustable text size and line width
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

To publish installers for every system, push a version tag (`git tag v0.2.0 && git push --tags`). `.github/workflows/release.yml` builds them and attaches them to a GitHub release. Icons and code signing are not set up yet; both go in the `build` section of `package.json`.

## How it is put together

One React app, two shells. The web build is what GitHub Pages serves. The desktop app is Electron loading that same build and adding native file dialogs.

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | State and layout: documents, preferences, toolbar, status bar |
| `src/components/Editor.jsx` | The textarea and its keyboard behaviour |
| `src/components/Sidebar.jsx` | Document list and search |
| `src/lib/files.js` | Opening and saving files. **Add new file types here** |
| `src/lib/storage.js` | Documents and preferences in `localStorage` |
| `src/lib/editing.js` | Bold/italic wrapping, indenting, list continuation |
| `src/lib/markdown.js` | The Markdown renderer behind the preview |
| `desktop/main.cjs` | Electron window, `app://` file server, open and save handlers |
| `desktop/preload.cjs` | The `window.desktop` bridge the page uses on desktop |
| `public/docs/` | User guide, published alongside the app |
| `.github/workflows/pages.yml` | Builds and deploys to GitHub Pages on every push to `main` |
| `.github/workflows/release.yml` | Builds desktop installers when a `v*` tag is pushed |

`src/lib/files.js` picks the best backend available: `window.desktop` in the desktop app, the File System Access API in Chrome and Edge, and upload/download elsewhere. Nothing outside that file knows which one is in use.

The desktop app can only write to paths the user chose in a dialog during that session (see `granted` in `desktop/main.cjs`).

## License

MIT. See [LICENSE](LICENSE).
