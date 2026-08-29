const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {nativeSnapshot, belongsToProject} = require('./dev-android.cjs');

test('Native fingerprint ignores TSX edits and generated build output, but detects native changes and port changes', () => {
  const parent = path.resolve(__dirname, '../artifacts/android-runtime/launcher-tests');
  fs.mkdirSync(parent, {recursive: true});
  const root = fs.mkdtempSync(path.join(parent, 'inputs-'));
  const write = (name, data) => {const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, data);};
  write('package.json', '{}');
  write('android/app/src/main/MainActivity.kt', 'native v1');
  write('src/App.tsx', 'UI v1');
  const initial = nativeSnapshot(root, {}, 8082).fingerprint;
  write('src/App.tsx', 'UI v2');
  write('android/app/build/generated.txt', 'build output');
  write('android/local.properties', 'machine-only SDK path');
  assert.equal(nativeSnapshot(root, {}, 8082).fingerprint, initial);
  assert.notEqual(nativeSnapshot(root, {}, 8083).fingerprint, initial);
  write('android/app/src/main/MainActivity.kt', 'native v2');
  assert.notEqual(nativeSnapshot(root, {}, 8082).fingerprint, initial);
  write('node_modules/native-library/package.json', '{"version":"1.0.0"}');
  write('node_modules/native-library/android/Library.kt', 'library v1');
  const dependencyRoot = path.join(root, 'node_modules/native-library');
  const config = {dependencies: {library: {root: dependencyRoot, platforms: {android: {sourceDir: path.join(dependencyRoot, 'android')}}}}};
  const native = nativeSnapshot(root, config, 8082).fingerprint;
  write('node_modules/native-library/package.json', '{"version":"2.0.0"}');
  assert.notEqual(nativeSnapshot(root, config, 8082).fingerprint, native);
});

function nativeCommand(args) {
  let captured;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'native.cjs'), 'utf8'), {
    __dirname,
    process: {argv: [process.execPath, 'native.cjs', ...args], execPath: process.execPath},
    require: name => name === 'node:child_process' ? {spawn: (...values) => {
      captured = values;
      return {on() {}};
    }} : name.includes('local-config') ? {metroPort: 8082} : require(name),
  });
  return captured;
}
test('Native CLI accepts matching --port only once and rejects conflicting/missing ports before spawn', () => {
  const [, args, options] = nativeCommand(['run-android', '--port', '8082', '--port=8082', '--no-packager']);
  assert.equal(args.filter(arg => arg === '--port').length, 1);
  assert.equal(args[args.indexOf('--port') + 1], '8082');
  assert.equal(options.cwd, path.resolve(__dirname, '..'));
  assert.throws(() => nativeCommand(['run-android', '--port', '8083']), /Metro port must match/);
  assert.throws(() => nativeCommand(['run-android', '--port']), /Metro port must match/);
});

test('Metro ownership requires this project CLI and the actual Node executable', () => {
  const command = `${process.execPath} ${path.resolve(__dirname, '../node_modules/react-native/cli.js')} start --port 8082`;
  assert.equal(belongsToProject({executable: process.execPath, command}), true);
  assert.equal(belongsToProject({executable: process.execPath, command: 'node C:/another-project/cli.js start --port 8082'}), false);
  assert.equal(belongsToProject({executable: 'C:/unknown/node.exe', command}), false);
});
