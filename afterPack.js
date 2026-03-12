const { execSync } = require('child_process');

// Strip macOS extended attributes (resource forks, Finder info) that Dropbox
// adds and that codesign refuses to process.
module.exports = async (context) => {
  if (context.electronPlatformName === 'darwin') {
    try {
      execSync(`xattr -cr "${context.appOutDir}"`);
    } catch (_) {}
  }
};
