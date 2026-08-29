const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {metroPort} = require('./src/services/local-config.json');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  maxWorkers: 2,
  server: {
    port: metroPort,
    enhanceMiddleware: middleware => (req, res, next) => {
      // Plain bundle responses avoid the Android/Windows multipart chunk error
      // that can leave a debug build stuck on its native splash screen.
      if (
        process.platform === 'win32' &&
        req.url?.split('?')[0].endsWith('.bundle')
      ) {
        req.headers.accept = 'application/javascript';
      }
      return middleware(req, res, next);
    },
  },
  resolver: {
    blockList: [
      /[/\\]design[/\\](?:source|tools|screens|video)[/\\].*/,
      /[/\\]frontend[/\\]artifacts[/\\].*/,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
