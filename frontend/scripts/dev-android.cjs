// Windows daily launcher. No backend, database, user-data clearing, or cache deletion.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync, spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts/android-dev');
const {metroPort, apiPort} = require('../src/services/local-config.json');
const origin = `http://127.0.0.1:${metroPort}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const normalized = value => path.resolve(value).replace(/\\/g, '/').toLowerCase();
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = (file, args, options = {}) => (execFileSync(file, args, {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000,
  maxBuffer: 8 * 1024 * 1024, ...options,
}) || '').trim();
const ps = script => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
const quote = value => `'${value.replace(/'/g, "''")}'`;

function nativeSnapshot(projectRoot, config, port) {
  const files = new Set();
  const excluded = new Set(['build', '.gradle', '.cxx', '.kotlin', '.git', 'node_modules']);
  function collect(folder) {
    if (!fs.existsSync(folder)) return;
    for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
      if (excluded.has(item.name) || item.name === 'local.properties' || item.isSymbolicLink()) continue;
      const file = path.join(folder, item.name);
      if (item.isDirectory()) collect(file); else if (item.isFile()) files.add(file);
    }
  }
  collect(path.join(projectRoot, 'android'));
  for (const name of ['react-native.config.js', 'react-native.config.cjs']) {
    const file = path.join(projectRoot, name);
    if (fs.existsSync(file)) files.add(file);
  }
  for (const dependency of Object.values(config.dependencies || {})) {
    if (!dependency.platforms?.android) continue;
    files.add(path.join(dependency.root, 'package.json'));
    collect(dependency.platforms.android.sourceDir);
  }
  for (const name of ['react-native', '@react-native/gradle-plugin']) {
    const file = path.join(projectRoot, 'node_modules', name, 'package.json');
    if (fs.existsSync(file)) files.add(file);
  }
  const pkg = json(path.join(projectRoot, 'package.json'));
  if (pkg.codegenConfig?.jsSrcsDir) collect(path.join(projectRoot, pkg.codegenConfig.jsSrcsDir));
  const digest = crypto.createHash('sha256').update(String(port)).update(JSON.stringify(pkg.codegenConfig || null));
  let newest = 0;
  for (const file of [...files].sort()) {
    digest.update(path.relative(projectRoot, file)).update(fs.readFileSync(file));
    newest = Math.max(newest, fs.statSync(file).mtimeMs);
  }
  return {fingerprint: digest.digest('hex'), newest, files: files.size};
}

function findJdk17() {
  const candidates = [process.env.JAVA_HOME];
  for (const directory of [path.join(os.homedir(), '.gradle/jdks'), path.join(os.homedir(), '.jdks')]) {
    if (fs.existsSync(directory)) for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.isDirectory()) candidates.push(path.join(directory, entry.name));
    }
  }
  const jdk = candidates.find(folder => folder && fs.existsSync(path.join(folder, 'bin/java.exe')) &&
    fs.existsSync(path.join(folder, 'release')) && /^JAVA_VERSION="17[.\"]/m.test(fs.readFileSync(path.join(folder, 'release'), 'utf8')));
  if (!jdk) throw Error('JDK 17 is required. Set JAVA_HOME to an installed JDK 17; no global settings were changed.');
  process.env.JAVA_HOME = jdk;
  process.env.PATH = `${path.join(jdk, 'bin')};${process.env.PATH}`;
  return jdk;
}

function listener() {
  const value = ps(`$c=@(Get-NetTCPConnection -State Listen -LocalPort ${metroPort} -ErrorAction SilentlyContinue); if($c.Count){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$c[0].OwningProcess); @{pid=$p.ProcessId;executable=$p.ExecutablePath;command=$p.CommandLine;addresses=@($c.LocalAddress)} | ConvertTo-Json -Compress}`);
  return value ? JSON.parse(value) : null;
}
function belongsToProject(processInfo) {
  return processInfo && normalized(processInfo.executable) === normalized(process.execPath) &&
    processInfo.command.replace(/\\/g, '/').toLowerCase().includes(`${normalized(root)}/node_modules/react-native/cli.js`) &&
    /\bstart\b/.test(processInfo.command);
}
function stopMetro(processInfo) {
  if (!belongsToProject(processInfo)) throw Error('Refusing to stop an unrecognized process.');
  // Recheck PID, executable and the exact command line immediately before stopping.
  ps(`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${processInfo.pid}'; if($p -and $p.ExecutablePath -eq ${quote(processInfo.executable)} -and $p.CommandLine -eq ${quote(processInfo.command)}){Stop-Process -Id $p.ProcessId} else {throw 'Metro identity changed; not stopped'}`);
}
async function background(file, args, label) {
  const log = path.join(output, `${label}-${Date.now()}`);
  const stdout = fs.openSync(`${log}.log`, 'a');
  const stderr = fs.openSync(`${log}.err.log`, 'a');
  try {
    const child = spawn(file, args, {cwd: root, env: process.env, detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr]});
    await new Promise((resolve, reject) => {child.once('spawn', resolve); child.once('error', reject);});
    child.unref();
    console.log(`${label} started (PID ${child.pid}). Logs: ${log}.log`);
    return child.pid;
  } finally {fs.closeSync(stdout); fs.closeSync(stderr);}
}
async function metroReady() {
  const response = await fetch(`${origin}/status`, {signal: AbortSignal.timeout(5000)});
  if (response.status !== 200 || (await response.text()).trim() !== 'packager-status:running' ||
      normalized(response.headers.get('X-React-Native-Project-Root') || '') !== normalized(root)) {
    throw Error('Metro status/project root does not match this frontend.');
  }
  // /status alone can succeed while Metro cannot deliver JavaScript.
  console.log('Checking the Android JavaScript bundle (no cache reset)...');
  const bundle = await fetch(`${origin}/index.bundle?platform=android&dev=true&minify=false`, {signal: AbortSignal.timeout(60000)});
  if (!bundle.ok) throw Error(`Metro bundle failed: HTTP ${bundle.status}. See Metro logs.`);
  let bytes = 0;
  for await (const chunk of bundle.body) bytes += chunk.length;
  if (!bytes) throw Error('Metro returned an empty bundle.');
  return bytes;
}
async function ensureMetro() {
  let current = listener();
  if (current && (!belongsToProject(current) || current.addresses.some(host => host !== '127.0.0.1' && host !== '::1'))) {
    throw Error(`Port ${metroPort} belongs to another process or a non-loopback listener. Nothing was stopped.`);
  }
  if (current) {
    console.log(`Reusing project Metro PID ${current.pid} on ${metroPort}.`);
    try {return {pid: current.pid, bundleBytes: await metroReady(), reused: true};}
    catch (error) {
      if (!['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)) throw error;
      console.log('Verified project Metro is unresponsive; restarting only that process, without clearing caches.');
      stopMetro(current);
      for (let i = 0; i < 20 && listener(); i++) await sleep(500);
      if (listener()) throw Error('Metro port has not been released. No duplicate was started.');
    }
  }
  await background(process.execPath, [path.join(__dirname, 'native.cjs'), 'start'], 'metro');
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    current = listener();
    if (current) break;
  }
  if (!belongsToProject(current)) throw Error('The expected Metro process did not start. Inspect artifacts/android-dev logs.');
  return {pid: current.pid, bundleBytes: await metroReady(), reused: false};
}

async function main() {
  if (process.platform !== 'win32') throw Error('This launcher is for Windows. Use the existing native scripts on other platforms.');
  const options = new Set(process.argv.slice(2));
  if ([...options].some(arg => !['--stop', '--rebuild'].includes(arg))) throw Error('Supported options: --stop or --rebuild. Ports come from local-config.json.');
  fs.mkdirSync(output, {recursive: true});
  const lock = path.join(output, 'launcher.lock');
  try {fs.writeFileSync(lock, String(process.pid), {flag: 'wx'});}
  catch {throw Error(`Another launcher may be running. Check the PID in ${lock}; no second launcher was started.`);}
  try {
    if (options.has('--stop')) {
      const current = listener();
      if (current) stopMetro(current);
      console.log('Project Metro stopped. Backend and emulator were left untouched.');
      return;
    }
    const jdk = findJdk17();
    const properties = path.join(root, 'android/local.properties');
    const configured = fs.existsSync(properties) ? fs.readFileSync(properties, 'utf8').match(/^sdk.dir=(.+)$/m)?.[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':') : '';
    const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, configured, path.join(os.homedir(), 'AppData/Local/Android/Sdk')]
      .find(folder => folder && fs.existsSync(path.join(folder, 'platform-tools/adb.exe')) && fs.existsSync(path.join(folder, 'emulator/emulator.exe')));
    if (!sdk) throw Error('Android SDK not found. Set ANDROID_HOME or android/local.properties.');
    process.env.ANDROID_HOME = process.env.ANDROID_SDK_ROOT = sdk;
    const adbFile = path.join(sdk, 'platform-tools/adb.exe');
    const adb = (args, settings) => run(adbFile, args, settings);
    const devices = () => adb(['devices']).split(/\r?\n/).map(line => line.match(/^(emulator-\d+)\s+(\S+)/)).filter(Boolean).map(m => ({serial: m[1], state: m[2]}));
    const avds = run(path.join(sdk, 'emulator/emulator.exe'), ['-list-avds']).split(/\r?\n/).map(name => name.trim()).filter(name => /^Pixel[_ -]?8(?:[_ -]|$)/i.test(name));
    if (avds.length !== 1) throw Error('Expected one Pixel 8 AVD. Resolve ambiguous/missing Pixel 8 devices in Android Studio first.');
    const avd = avds[0];
    let serial;
    const existing = devices();
    for (const device of existing) {
      if (device.state !== 'device') continue;
      if (adb(['-s', device.serial, 'emu', 'avd', 'name']).split(/\r?\n/)[0].trim() === avd) serial = device.serial;
    }
    const runningAvds = ps("@(Get-CimInstance Win32_Process | Where-Object {$_.Name -like 'qemu-system-*.exe'} | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress");
    const processes = runningAvds ? [JSON.parse(runningAvds)].flat() : [];
    if (!serial && existing.length === 1 && existing[0].state === 'offline' && processes.length === 1 &&
        processes[0].CommandLine.replace(/\\/g, '/').toLowerCase().includes(normalized(path.join(sdk, 'emulator/qemu'))) &&
        processes[0].CommandLine.includes(`-avd ${avd}`)) {
      console.log(`Reconnecting only the identified offline Pixel 8 transport ${existing[0].serial}...`);
      adb(['-s', existing[0].serial, 'reconnect']);
    }
    if (!serial && (existing.length || (runningAvds && runningAvds !== '[]'))) {
      // Do not kill adb, wipe an AVD, or launch a second emulator to handle offline state.
      console.log('An emulator already exists. Waiting for it to become online; no duplicate will be started.');
    } else if (!serial) {
      await background(path.join(sdk, 'emulator/emulator.exe'), ['-avd', avd, '-netdelay', 'none', '-netspeed', 'full'], 'pixel-8');
    }
    for (let i = 0; i < 120; i++) {
      for (const device of devices()) {
        if (device.state === 'device' && adb(['-s', device.serial, 'emu', 'avd', 'name']).split(/\r?\n/)[0].trim() === avd) serial = device.serial;
      }
      if (serial && adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed']) === '1') break;
      if (i === 119) throw Error('Pixel 8 did not become ready. Check Android Studio; no process was killed and no AVD data was cleared.');
      if (i % 10 === 0) console.log('Waiting for Pixel 8 boot_completed=1...');
      await sleep(1000);
    }
    if (devices().length !== 1) throw Error('Multiple emulators detected; select/close extras manually. Nothing was killed.');
    const device = (args, settings) => adb(['-s', serial, ...args], settings);
    console.log(`Pixel 8: ${avd} / ${serial}; JAVA_HOME=${jdk}`);
    const metro = await ensureMetro();
    device(['reverse', `tcp:${metroPort}`, `tcp:${metroPort}`]);
    if (!device(['reverse', '--list']).includes(`tcp:${metroPort} tcp:${metroPort}`)) throw Error('adb reverse was not established.');

    const config = JSON.parse(run(process.execPath, [path.join(root, 'node_modules/react-native/cli.js'), 'config']));
    const {applicationId, mainActivity} = config.project.android;
    if (!/^[\w.]+$/.test(applicationId) || !/^[\w.]+$/.test(mainActivity)) throw Error('Unexpected Android application identifier.');
    const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
    const stateFile = path.join(output, 'native-state.json');
    const state = fs.existsSync(stateFile) ? json(stateFile) : {};
    const snapshot = nativeSnapshot(root, config, metroPort);
    const info = device(['shell', 'dumpsys', 'package', applicationId]);
    const installed = /DEBUGGABLE/.test(info);
    const updated = info.match(/lastUpdateTime=(.+)/)?.[1];
    const currentApkHash = fs.existsSync(apk) ? hash(apk) : null;
    let knownBuild = installed && state.fingerprint === snapshot.fingerprint && state.updated === updated && state.apkHash === currentApkHash;
    if (!knownBuild && installed && currentApkHash && snapshot.newest <= fs.statSync(apk).mtimeMs) {
      const remote = device(['shell', 'pm', 'path', applicationId]).replace(/^package:/, '');
      if (/^\/data\/app\/[\w/~.=+-]+$/.test(remote)) knownBuild = device(['shell', 'sha256sum', remote]).split(/\s+/)[0] === currentApkHash;
    }
    let rebuilt = false;
    if (!knownBuild || options.has('--rebuild')) {
      console.log('Native inputs changed or no matching Debug APK exists. Building/installing Debug once (no clean).');
      run(process.execPath, [path.join(__dirname, 'native.cjs'), 'run-android', '--device', serial, '--mode', 'debug', '--active-arch-only', '--no-packager'], {stdio: 'inherit', timeout: 20 * 60 * 1000});
      rebuilt = true;
    } else console.log('Matching Debug app found. Skipping Android build/install.');
    const finalInfo = device(['shell', 'dumpsys', 'package', applicationId]);
    if (!/DEBUGGABLE/.test(finalInfo)) throw Error('The installed application is not Debug. No app data was cleared.');
    device(['shell', 'run-as', applicationId, 'true']);
    console.log('Opening the installed Debug app (allowing up to 60 seconds for Android startup)...');
    device(['shell', 'am', 'start', '-W', '-n', `${applicationId}/${mainActivity}`], {timeout: 60000});

    // Change only React Native development settings, via its own UI (no app-data edits).
    let preferences = '';
    try {preferences = device(['shell', 'run-as', applicationId, 'cat', `shared_prefs/${applicationId}_preferences.xml`]);}
    catch { /* A fresh Debug install can have no saved development preferences yet. */ }
    const savedHost = preferences.match(/<string name="debug_http_host">([^<]*)<\/string>/)?.[1];
    const allowed = ['', undefined, `localhost:${metroPort}`, `127.0.0.1:${metroPort}`, `10.0.2.2:${metroPort}`];
    async function nodes() {
      device(['shell', 'uiautomator', 'dump', '/sdcard/csc-dev-launcher.xml']);
      return [...device(['exec-out', 'cat', '/sdcard/csc-dev-launcher.xml']).matchAll(/<node\b[^>]+/g)].map(m => Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
    }
    const tap = node => {
      if (!node?.bounds) throw Error('Expected React Native Dev Menu control is missing. No application data was changed.');
      const [x1, y1, x2, y2] = node.bounds.match(/\d+/g).map(Number);
      device(['shell', 'input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2))]);
    };
    if (!allowed.includes(savedHost)) {
      device(['shell', 'input', 'keyevent', '82']);
      tap((await nodes()).find(node => node.text === 'Change Bundle Location'));
      tap((await nodes()).find(node => node.class === 'android.widget.EditText'));
      device(['shell', 'input', 'keycombination', '113', '29']);
      device(['shell', 'input', 'text', `127.0.0.1:${metroPort}`]);
      device(['shell', 'input', 'keyevent', '4']); // Hide keyboard, then find the actual button bounds.
      tap((await nodes()).find(node => node.text === 'APPLY CHANGES'));
      console.log('Corrected the saved bundle location through the React Native Dev Menu.');
    }
    if (preferences.includes('name="hot_module_replacement" value="false"')) {
      device(['shell', 'input', 'keyevent', '82']);
      tap((await nodes()).find(node => node.text === 'Enable Fast Refresh'));
    }
    let connected = false;
    let reloadRequested = false;
    const deadline = Date.now() + 90000;
    for (let i = 0; Date.now() < deadline; i++) {
      try {
        const pages = await (await fetch(`${origin}/json/list`, {signal: AbortSignal.timeout(5000)})).json();
        if (pages.some(page => page.appId === applicationId)) {connected = true; break;}
      } catch { /* Metro can be busy compiling the first bundle after installation. */ }
      if (i === 3) {
        // An already-open error screen does not reload just because Metro restarted.
        // Target only this app's registered React Native reload receiver.
        device(['shell', 'am', 'broadcast', '-a', `${applicationId}.RELOAD_APP_ACTION`, '-p', applicationId]);
        reloadRequested = true;
      }
      if (i % 5 === 0) console.log('Waiting for the installed app to connect to Metro...');
      await sleep(1000);
    }
    if (!connected) throw Error('App did not connect to Metro. See artifacts/android-dev logs and adb logcat.');
    let backendReady = false;
    try {backendReady = (await fetch(`http://127.0.0.1:${apiPort}/v1/health/ready`, {signal: AbortSignal.timeout(3000)})).ok;} catch {}
    const result = {checkedAt: new Date().toISOString(), project: root, avd, serial, applicationId, metroPort, metro, jdk, rebuilt, connected, reloadRequested, backendReady};
    fs.writeFileSync(stateFile, JSON.stringify({fingerprint: nativeSnapshot(root, config, metroPort).fingerprint, updated: finalInfo.match(/lastUpdateTime=(.+)/)?.[1], apkHash: hash(apk)}, null, 2));
    fs.writeFileSync(path.join(output, 'last-run.json'), JSON.stringify(result, null, 2));
    console.log(`READY: ${applicationId} on ${avd}; Metro ${metroPort}; Fast Refresh enabled.`);
    if (!backendReady) console.log('Backend is not ready. In another terminal at the workspace root, run: npm run start:backend');
    console.log('Metro stays running. Stop only this project Metro with: npm run android:dev -- --stop');
  } finally {fs.unlinkSync(lock);}
}

module.exports = {nativeSnapshot, belongsToProject};
if (require.main === module) main().catch(error => {console.error(`Android startup failed: ${error.message}`); process.exitCode = 1;});
