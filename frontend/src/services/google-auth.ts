import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  ApiError,
  createGoogleChallenge,
  finishGoogleSignIn,
} from './api';

export const GOOGLE_WEB_CLIENT_ID =
  '175641500115-gjqvdqhnvs8gl579kfvg8il3l8r9ka1n.apps.googleusercontent.com';

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});

function friendlyGoogleError(error: unknown): Error {
  const code = String((error as { code?: string })?.code || '');
  if (code === 'GOOGLE_SIGN_IN_CANCELLED') {
    return new ApiError('Google sign-in was cancelled.', code);
  }
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return new ApiError(
      'Google Play Services is unavailable or needs an update.',
      code,
    );
  }
  if (code === statusCodes.IN_PROGRESS) {
    return new ApiError('Google sign-in is already in progress.', code);
  }
  return error instanceof Error
    ? error
    : new ApiError('Google sign-in failed. Please try again.', code);
}

export async function signInWithGoogle(rememberMe: boolean) {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const challenge = await createGoogleChallenge();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      throw new ApiError(
        'Google sign-in was cancelled.',
        'GOOGLE_SIGN_IN_CANCELLED',
      );
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new ApiError('Google did not return an ID token.', 'MISSING_ID_TOKEN');
    }
    return await finishGoogleSignIn(
      challenge.challengeId,
      idToken,
      rememberMe,
    );
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === statusCodes.SIGN_IN_CANCELLED
    ) {
      throw new ApiError(
        'Google sign-in was cancelled.',
        'GOOGLE_SIGN_IN_CANCELLED',
      );
    }
    throw friendlyGoogleError(error);
  }
}
