jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }) =>
      React.createElement(React.Fragment, null, children),
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
  };
});
jest.mock('react-native-svg', () => ({ SvgXml: 'SvgXml' }));
jest.mock('react-native-video', () => 'Video');
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  types: { images: 'image/*', video: 'video/*' },
  isErrorWithCode: () => false,
  errorCodes: { OPERATION_CANCELED: 'cancelled' },
}));
jest.mock('react-native-blob-util', () => ({
  fs: { stat: jest.fn(), hash: jest.fn(), unlink: jest.fn() },
  config: jest.fn(),
  wrap: jest.fn(),
}));
