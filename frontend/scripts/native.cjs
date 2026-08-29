// Public local ports only. Never load backend environment files into Metro.
const {spawn} = require('node:child_process');
const path = require('node:path');
const {metroPort} = require('../src/services/local-config.json');
const [command, ...suppliedArgs] = process.argv.slice(2);
if (!['start', 'run-android', 'run-ios'].includes(command)) {
  throw new Error('Unknown React Native command');
}
const args = [];
for (let index = 0; index < suppliedArgs.length; index++) {
  const arg = suppliedArgs[index];
  if (arg === '--port' || arg.startsWith('--port=')) {
    const port = arg === '--port' ? suppliedArgs[++index] : arg.slice(7);
    if (String(port) !== String(metroPort)) {
      throw new Error(`Metro port must match src/services/local-config.json (${metroPort}).`);
    }
  } else {
    args.push(arg);
  }
}
const child = spawn(process.execPath, [
  path.join(__dirname, '../node_modules/react-native/cli.js'), command,
  '--port', String(metroPort), ...(command === 'start' ? ['--host', '127.0.0.1'] : []), ...args,
], {cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true});
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
