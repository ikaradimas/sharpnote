'use strict';
// No-op signer for electron-builder. We don't have a Windows code-signing
// certificate, so the right thing is to simply not sign anything. Returning
// without invoking signtool also short-circuits the winCodeSign-2.6.0.7z
// download/extraction that fails on Windows without admin / Developer Mode
// (the archive contains macOS dylib symlinks that Windows cannot create).
//
// When a real code-signing identity is acquired later, swap this for a
// proper signtool invocation or remove the `build.win.sign` field so
// electron-builder runs its default signing flow.
exports.default = async function noopSign(/* configuration */) {
  // Intentionally empty.
};
