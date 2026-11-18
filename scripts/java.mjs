// Builds and runs the Java desktop shell (java/src). Needs a JDK 21 or newer on PATH; nothing else.
//   node scripts/java.mjs run              build the web app, compile, open the window
//   node scripts/java.mjs package [type]   self-contained app in release/java (type: app-image,
//                                          or exe/msi/deb/rpm/dmg/pkg if your system has the tools)
// JavaFX is downloaded once from Maven Central into java/lib/ (git-ignored).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JFX = '25.0.2';
const ARTIFACTS = ['javafx-base', 'javafx-graphics', 'javafx-controls', 'javafx-media', 'javafx-web', 'jdk-jsobject'];
const MODULES = 'javafx.controls,javafx.web,jdk.jsobject';
const JAVA_OPTS = ['--enable-native-access=javafx.graphics,javafx.web,javafx.media', '--sun-misc-unsafe-memory-access=allow'];
const PLATFORM = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform] + (process.arch === 'arm64' ? '-aarch64' : '');

const [mode = 'run', type = 'app-image'] = process.argv.slice(2);
// Paths handed to JDK tools are relative to ROOT: on Windows they mangle non-ASCII absolute paths.
const lib = join('java', 'lib', PLATFORM);
const build = join('java', 'build');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT });

// fs.cpSync crashes and fs.rmSync silently does nothing on some non-ASCII Windows paths
// (seen with Node 24), so copy and delete by hand.
function removeDir(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, entry.name);
    if (entry.isDirectory()) removeDir(f); else unlinkSync(f);
  }
  rmdirSync(dir);
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const a = join(from, entry.name), b = join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b); else copyFileSync(a, b);
  }
}

async function fetchJavaFX() {
  mkdirSync(join(ROOT, lib), { recursive: true });
  for (const name of ARTIFACTS) {
    const file = join(ROOT, lib, `${name}.jar`);
    if (existsSync(file)) continue;
    const url = `https://repo1.maven.org/maven2/org/openjfx/${name}/${JFX}/${name}-${JFX}-${PLATFORM}.jar`;
    console.log(`Downloading ${name} ${JFX} (${PLATFORM})`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}

await fetchJavaFX();
removeDir(join(ROOT, 'dist'));   // Vite's own clean-up hits the same rmSync problem
run(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'build']);
removeDir(join(ROOT, build));
const classes = join(build, 'classes');
run('javac', ['--release', '21', '--module-path', lib, '--add-modules', MODULES, '-d', classes, join('java', 'src', 'margin', 'Margin.java')]);

if (mode === 'run') {
  run('java', [...JAVA_OPTS, '--module-path', lib, '--add-modules', MODULES, '-Dmargin.web=dist', '-cp', classes, 'margin.Margin']);
} else if (mode === 'package') {
  const input = join(build, 'app');
  mkdirSync(join(ROOT, input), { recursive: true });
  run('jar', ['--create', '--file', join(input, 'margin.jar'), '-C', classes, '.']);
  copyDir(join(ROOT, 'dist'), join(ROOT, input, 'web'));
  const { version, description } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const dest = join('release', 'java');
  removeDir(join(ROOT, dest, process.platform === 'darwin' ? 'Margin.app' : 'Margin'));
  run('jpackage', [
    '--type', type, '--name', 'Margin', '--app-version', version, '--description', description, '--vendor', 'PyMite6941',
    '--input', input, '--main-jar', 'margin.jar', '--main-class', 'margin.Margin',
    '--module-path', lib, '--add-modules', `${MODULES},java.net.http`,
    ...JAVA_OPTS.flatMap(o => ['--java-options', o]),
    // Each system's own icon format, made by scripts/icons.py. Without one, the taskbar and Dock show Java's.
    '--icon', join('build', { win32: 'icon.ico', darwin: 'icon.icns' }[process.platform] || 'icon.png'),
    ...(process.platform === 'darwin' ? ['--mac-package-identifier', 'io.github.pymite6941.margin.java', '--mac-package-name', 'Margin'] : []),
    '--dest', dest,
  ]);
  console.log(`Built into ${dest}`);
} else {
  console.error(`Unknown mode "${mode}". Use run or package.`);
  process.exit(1);
}
