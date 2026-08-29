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
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({
      type: 'success',
      data: {
        idToken: 'verified-google-id-token',
        user: { name: 'Google Learner', email: 'google@example.test' },
      },
    })),
    signOut: jest.fn(async () => null),
  },
  isSuccessResponse: response => response?.type === 'success',
  isErrorWithCode: error => typeof error?.code === 'string',
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));
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
