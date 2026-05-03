/**
 * Expo config plugin: inject react-native-executorch's tokenizer static
 * libraries into the host app's link command.
 *
 * react-native-executorch declares these via `user_target_xcconfig` in its
 * podspec, but CocoaPods silently drops them when other pods set conflicting
 * OTHER_LDFLAGS — the LocalChat target ends up missing
 * libtokenizers_cpp.a / libsentencepiece.a / libtokenizers_c.a, and linking
 * fails with `Undefined symbols: tokenizers::Tokenizer::FromBlobJSON`.
 *
 * The fix patches the generated Pods-LocalChat xcconfig files directly.
 * Setting OTHER_LDFLAGS on the Pods aggregate target via build_settings does
 * NOT propagate to the xcconfig the main app reads — only direct file edits do.
 *
 * Critically: this hook must run AFTER `react_native_post_install`, because
 * that hook regenerates the xcconfig files and would wipe our additions.
 *
 * Survives `expo prebuild --clean` by patching the generated Podfile.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const HOOK_MARKER = '# expo-config-plugin: with-executorch-tokenizers v2';

const POST_INSTALL_BODY = `
    ${HOOK_MARKER}
    # Runs AFTER react_native_post_install because that hook regenerates the
    # xcconfig files and would wipe our additions.
    device_libs = [
      '"$\{PODS_ROOT}/../../node_modules/react-native-executorch/third-party/ios/libs/tokenizers-cpp/physical-arm64-release/libtokenizers_cpp.a"',
      '"$\{PODS_ROOT}/../../node_modules/react-native-executorch/third-party/ios/libs/tokenizers-cpp/physical-arm64-release/libsentencepiece.a"',
      '"$\{PODS_ROOT}/../../node_modules/react-native-executorch/third-party/ios/libs/tokenizers-cpp/physical-arm64-release/libtokenizers_c.a"',
    ].join(' ')
    sim_libs = [
      '"$\{PODS_ROOT}/../../node_modules/react-native-executorch/third-party/ios/libs/tokenizers-cpp/simulator-arm64-debug/libtokenizers_cpp.a"',
      '"$\{PODS_ROOT}/../../node_modules/react-native-executorch/third-party/ios/libs/tokenizers-cpp/simulator-arm64-debug/libsentencepiece.a"',
      '"$\{PODS_ROOT}/../../node_modules/react-native-executorch/third-party/ios/libs/tokenizers-cpp/simulator-arm64-debug/libtokenizers_c.a"',
    ].join(' ')
    installer.aggregate_targets.each do |aggregate_target|
      next unless aggregate_target.name == 'Pods-LocalChat'
      aggregate_target.user_build_configurations.each_key do |config_name|
        xcconfig_path = aggregate_target.xcconfig_path(config_name)
        next unless File.exist?(xcconfig_path)
        text = File.read(xcconfig_path)
        next if text.include?('libtokenizers_cpp.a')
        text << "\\nOTHER_LDFLAGS[sdk=iphoneos*] = $(inherited) #{device_libs}\\n"
        text << "OTHER_LDFLAGS[sdk=iphonesimulator*] = $(inherited) #{sim_libs}\\n"
        File.write(xcconfig_path, text)
      end
    end
`;

// Removes any prior version of this plugin's block so we can re-inject the new one.
const OLD_BLOCK_PATTERN = /\n?\s*# expo-config-plugin: with-executorch-tokenizers(?: v\d+)?\n[\s\S]*?(?=\n\s*react_native_post_install|\n\s*end\s*$|\n\s*end\s*\n\s*end)/m;

module.exports = function withExecutorchTokenizers(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes(HOOK_MARKER)) return cfg;
      contents = contents.replace(OLD_BLOCK_PATTERN, '');
      // Inject AFTER the react_native_post_install(...) call so our xcconfig
      // edits aren't overwritten by RN's hook.
      contents = contents.replace(
        /(react_native_post_install\([\s\S]*?\n\s*\)\n)/,
        `$1\n${POST_INSTALL_BODY}\n`
      );
      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
