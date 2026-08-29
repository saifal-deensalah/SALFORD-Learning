import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  createGoogleChallenge,
  finishGoogleSignIn,
} from '../src/services/api';
import {
  GOOGLE_WEB_CLIENT_ID,
  signInWithGoogle,
} from '../src/services/google-auth';

jest.mock('../src/services/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string, public code = '', public status = 0) {
      super(message);
    }
  },
  createGoogleChallenge: jest.fn(async () => ({
    challengeId: '10000000-0000-4000-8000-000000000001',
    nonce: 'server-nonce',
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  })),
  finishGoogleSignIn: jest.fn(async () => ({
    id: 'google-user',
    name: 'Google Learner',
    email: 'google@example.test',
    role: 'student',
  })),
}));

test('configures the native SDK with the Web OAuth client ID', () => {
  expect(GoogleSignin.configure).toHaveBeenCalledWith({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
});

test('gets Play Services, extracts the v16 idToken and completes backend login', async () => {
  await expect(signInWithGoogle(true)).resolves.toMatchObject({
    role: 'student',
  });
  expect(GoogleSignin.hasPlayServices).toHaveBeenCalledWith({
    showPlayServicesUpdateDialog: true,
  });
  expect(createGoogleChallenge).toHaveBeenCalled();
  expect(finishGoogleSignIn).toHaveBeenCalledWith(
    '10000000-0000-4000-8000-000000000001',
    'verified-google-id-token',
    true,
  );
});

test('does not call the backend login after the user cancels Google', async () => {
  const completedBefore = (finishGoogleSignIn as jest.Mock).mock.calls.length;
  (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({
    type: 'cancelled',
    data: null,
  });
  await expect(signInWithGoogle(false)).rejects.toMatchObject({
    code: 'GOOGLE_SIGN_IN_CANCELLED',
  });
  expect((finishGoogleSignIn as jest.Mock).mock.calls).toHaveLength(
    completedBefore,
  );
});

test('maps missing Play Services to a useful error', async () => {
  (GoogleSignin.hasPlayServices as jest.Mock).mockRejectedValueOnce({
    code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
  });
  await expect(signInWithGoogle(false)).rejects.toMatchObject({
    code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
  });
});
