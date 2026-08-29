module.exports = {
  testTimeout: 20000,
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/design/'],
  modulePathIgnorePatterns: ['<rootDir>/artifacts/'],
};
