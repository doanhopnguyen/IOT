const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');
module.exports = config => {
  config = withAndroidManifest(config, value => {
  // The current Tailscale/LAN deployment and ESP32 setup portal use HTTP.
  const application = value.modResults.manifest.application?.[0];
  if (application) application.$['android:usesCleartextTraffic'] = 'true';
  return value;
  });
  return withAppBuildGradle(config, value => {
    // Hash long generated C++ object paths on Windows, where Ninja has a 260-character limit.
    const marker = '// Smart Door: bounded native object paths';
    value.modResults.contents = value.modResults.contents.replace(/-DCMAKE_OBJECT_PATH_MAX=\d+/g, '-DCMAKE_OBJECT_PATH_MAX=250');
    if (!value.modResults.contents.includes(marker)) {
      value.modResults.contents = value.modResults.contents.replace(/android\s*\{/, `android {
    ${marker}
    defaultConfig { externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=250" } } }
`);
    }
    return value;
  });
};
