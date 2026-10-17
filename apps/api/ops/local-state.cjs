'use strict';
// A separate, explicit Linux development state directory; Windows keeps its path.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function localState() {
  if (process.platform === 'win32') {
    const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'VIEWS-Staging');
    return { root, privateDir: path.join(root, 'private'), scope: 'views-windows-local-rehearsal' };
  }
  const root = process.env.VIEWS_LOCAL_STATE_DIR;
  if (process.platform !== 'linux' || process.env.VIEWS_CLOUD_REHEARSAL !== 'true' || !root || !path.isAbsolute(root)) {
    throw Error('EXPLICIT_LINUX_LOCAL_REHEARSAL_REQUIRED');
  }
  const real = fs.realpathSync(root);
  const repo = fs.realpathSync(path.resolve(__dirname, '../../..'));
  if (real === repo || real.startsWith(repo + path.sep)) throw Error('LOCAL_STATE_MUST_BE_OUTSIDE_CHECKOUT');
  for (const dir of [real, path.join(real, 'private')]) {
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) {
      throw Error('LOCAL_STATE_PERMISSIONS_INVALID');
    }
  }
  return { root: real, privateDir: path.join(real, 'private'), scope: 'views-cloud-local-rehearsal' };
}

module.exports = { localState };
