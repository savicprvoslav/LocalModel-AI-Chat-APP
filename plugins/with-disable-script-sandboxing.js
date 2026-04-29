/**
 * Expo config plugin: disable Xcode 26's User Script Sandboxing on the
 * main iOS target so Expo's dev script can write `ip.txt` into the .app
 * bundle without being killed by the sandbox.
 *
 * Survives `expo prebuild --clean`. Without this plugin, the regenerated
 * Xcode project always re-enables sandboxing.
 */
const { withXcodeProject } = require('@expo/config-plugins');

const FLIP_BUILD_SETTINGS = (configurations) => {
  for (const config of Object.values(configurations || {})) {
    if (!config || typeof config !== 'object') continue;
    if (!config.buildSettings) continue;
    config.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
  }
};

module.exports = function withDisableScriptSandboxing(config) {
  return withXcodeProject(config, (cfg) => {
    const xcode = cfg.modResults;
    const configurations = xcode.pbxXCBuildConfigurationSection();
    FLIP_BUILD_SETTINGS(configurations);
    return cfg;
  });
};
