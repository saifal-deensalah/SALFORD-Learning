import React from 'react';
import { ActivityIndicator, Alert, Linking } from 'react-native';
import Renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import manifest from '../src/design/manifest.json';
import { pick, keepLocalCopy } from '@react-native-documents/picker';
import BlobUtil from 'react-native-blob-util';
import { uploadMedia } from '../src/admin/upload';
import { Playback } from '../src/learning/Playback';
import {
  api,
  getSessionUser,
  hasSession,
  signIn,
  signOut,
  useSessionUser,
} from '../src/services/api';

jest.mock('../src/services/api', () => ({
  requestId: () => '10000000-0000-4000-8000-000000000001',
  sessionGeneration: () => 0,
  useSessionUser: jest.fn(() => null),
  getSessionUser: jest.fn(() => null),
  mediaUrl: (value: string) => value,
  setAdminKey: jest.fn(),
  hasSession: jest.fn(() => true),
  signOut: jest.fn(async () => {}),
  signIn: jest.fn(async () => ({
    id: 'user',
    name: 'Learner',
    email: 'test@example.com',
  })),
  api: jest.fn(async (path: string) =>
    path === '/billing/demo-plans'
      ? [
          {
            id: 'plan-premium',
            code: 'premium',
            name: 'Premium',
            amountMinor: 2999,
            currency: 'USD',
            durationDays: 30,
          },
        ]
      : { id: 'demo-payment', status: 'succeeded' },
  ),
}));

let app: ReactTestRenderer;
async function mount(id?: string) {
  jest
    .spyOn(Linking, 'getInitialURL')
    .mockResolvedValue(id ? `salford://preview/${id}` : null);
  await act(async () => {
    app = Renderer.create(<App />);
  });
}
async function press(id: string) {
  const button = app.root.findAll(
    n =>
      n.props.testID === `node-${id}` && typeof n.props.onPress === 'function',
  )[0];
  expect(button).toBeDefined();
  await act(async () => {
    button.props.onPress({ stopPropagation: jest.fn() });
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  (api as jest.Mock).mockImplementation(async (path: string) =>
    path === '/billing/demo-plans'
      ? [
          {
            id: 'plan-premium',
            code: 'premium',
            name: 'Premium',
            amountMinor: 2999,
            currency: 'USD',
            durationDays: 30,
          },
        ]
      : { id: 'demo-payment', status: 'succeeded' },
  );
  (hasSession as jest.Mock).mockReturnValue(true);
  (useSessionUser as jest.Mock).mockReturnValue(null);
  (getSessionUser as jest.Mock).mockReturnValue(null);
  jest.useFakeTimers();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (app) {
    await act(async () => app.unmount());
  }
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each(manifest)(
  'renders original Figma frame $id ($name)',
  async ({ id }) => {
    await mount(id);
    expect(
      app.root.findAll(n => n.props.testID === `screen-${id}`).length,
    ).toBeGreaterThan(0);
  },
);
test('onboarding leads through each screen to login', async () => {
  await mount('47');
  await press('1:419');
  await press('1:559');
  await press('1:802');
  await press('1:817');
  expect(
    app.root.findAll(n => n.props.testID === 'input-email').length,
  ).toBeGreaterThan(0);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    'salford.learning.v2.guest',
    expect.stringContaining('"onboarded":true'),
  );
});
test('login validates, authenticates with the server and never persists passwords', async () => {
  await mount('818');
  await press('1:893');
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'SALFORD',
    'Enter a valid email address.',
  );
  for (const [key, value] of [
    ['email', 'test@example.com'],
    ['password', 'password123'],
  ]) {
    await act(async () =>
      app.root
        .findAll(
          n => n.props.testID === `input-${key}` && n.props.onChangeText,
        )[0]
        .props.onChangeText(value),
    );
  }
  await press('1:893');
  expect(signIn).toHaveBeenCalledWith('test@example.com', 'password123');
  expect(
    app.root.findAll(n => n.props.testID === 'screen-1066').length,
  ).toBeGreaterThan(0);
  expect(
    (AsyncStorage.setItem as jest.Mock).mock.calls.every(
      c => !c[1].includes('password123'),
    ),
  ).toBe(true);
});
test('restored checkout sends only the selected plan and waits for server success', async () => {
  await mount('1951');
  expect(
    app.root.findAll(n =>
      ['input-card', 'input-holder', 'input-expiry', 'input-cvv'].includes(
        n.props.testID,
      ),
    ).length,
  ).toBeGreaterThan(0);
  expect(
    app.root.findAll(n => n.props.accessibilityLabel?.startsWith('Pay with')),
  ).toHaveLength(0);
  await pressText('Fill test payment details');
  await press('1:2085');
  expect(api).toHaveBeenCalledWith(
    '/billing/demo-purchases',
    'POST',
    { planId: 'plan-premium' },
    '10000000-0000-4000-8000-000000000001',
  );
  expect(
    app.root.findAll(n => n.props.testID === 'screen-2086').length,
  ).toBeGreaterThan(0);
  expect(
    (AsyncStorage.setItem as jest.Mock).mock.calls.every(
      c => !c[1].includes('4242'),
    ),
  ).toBe(true);
  await press('1:2229');
  expect(
    app.root.findAll(n => n.props.testID === 'screen-1479').length,
  ).toBeGreaterThan(0);
});

test('checkout has no success fallback when the server rejects the payment', async () => {
  await mount('1951');
  await pressText('Fill test payment details');
  (api as jest.Mock).mockRejectedValueOnce(new Error('Server unavailable'));
  await press('1:2085');
  expect(app.root.findAll(n => n.props.testID === 'screen-2086')).toHaveLength(
    0,
  );
  expect(
    app.root.findAll(n => n.props.children === 'Server unavailable').length,
  ).toBeGreaterThan(0);
  await press('1:2085');
  const purchases = (api as jest.Mock).mock.calls.filter(
    c => c[0] === '/billing/demo-purchases',
  );
  expect(purchases[0][3]).toBe(purchases[1][3]);
});

test('checkout requires a server session and never submits anonymously', async () => {
  (hasSession as jest.Mock).mockReturnValue(false);
  await mount('1951');
  expect(api).not.toHaveBeenCalled();
  await pressText('Log in to continue');
  expect(
    app.root.findAll(n => n.props.testID === 'screen-818').length,
  ).toBeGreaterThan(0);
});

test('Google artwork never creates a fake authenticated session', async () => {
  await mount('818');
  for (const id of ['1:837', '1:844']) {
    const button = app.root.findAll(n => n.props.testID === `node-${id}`)[0];
    expect(button.props.disabled).toBe(true);
    expect(button.props.onPress).toBeUndefined();
    expect(button.props.accessibilityState.disabled).toBe(true);
  }
  expect(app.root.findAll(n => n.props.testID === 'screen-894')).toHaveLength(
    0,
  );
  expect(signIn).not.toHaveBeenCalled();
  await act(async () => app.unmount());
  await mount('894');
  await press('1:975');
  expect(app.root.findAll(n => n.props.testID === 'screen-1066')).toHaveLength(
    0,
  );
  expect(
    app.root.findAll(n => n.props.testID === 'screen-818').length,
  ).toBeGreaterThan(0);
});

test('local signup uses real login after creation without showing activation instructions', async () => {
  (api as jest.Mock).mockResolvedValue({emailVerificationRequired: false});
  await mount('985');
  for (const [key, value] of Object.entries({email: 'local@example.test', password: 'Strong-local-password', confirm: 'Strong-local-password'})) {
    await act(async () => app.root.findAll(n => n.props.testID === `input-${key}` && n.props.onChangeText)[0].props.onChangeText(value));
  }
  await press('1:1065');
  expect(api).toHaveBeenCalledWith('/auth/register', 'POST', {email: 'local@example.test', password: 'Strong-local-password'});
  expect(signIn).toHaveBeenCalledWith('local@example.test', 'Strong-local-password');
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(app.root.findAll(n => n.props.testID === 'screen-1066').length).toBeGreaterThan(0);
});

test('duplicate registration never signs in or leaves the signup form', async () => {
  (api as jest.Mock).mockRejectedValue(new Error('This email is already registered. Please log in.'));
  await mount('985');
  for (const [key, value] of Object.entries({email: 'local@example.test', password: 'Strong-local-password', confirm: 'Strong-local-password'})) {
    await act(async () => app.root.findAll(n => n.props.testID === `input-${key}` && n.props.onChangeText)[0].props.onChangeText(value));
  }
  await press('1:1065');
  expect(signIn).not.toHaveBeenCalled();
  expect(app.root.findAll(n => n.props.testID === 'screen-985').length).toBeGreaterThan(0);
  expect(Alert.alert).toHaveBeenLastCalledWith('SALFORD', expect.stringContaining('already registered'));
});

test('Figma signup keeps only its three fields and returns existing users to login', async () => {
  await mount('985');
  const inputs = new Set(app.root.findAll(n => n.props.testID?.startsWith('input-') && n.props.onChangeText).map(n => n.props.testID));
  expect([...inputs].sort()).toEqual(['input-confirm', 'input-email', 'input-password']);
  await press('1:994');
  expect(app.root.findAll(n => n.props.testID === 'screen-818').length).toBeGreaterThan(0);
  expect(app.root.findAll(n => n.props.testID === 'input-confirm')).toHaveLength(0);
});

test('local unverified profile hides activation messages and resend action', async () => {
  const user = {id: 'local-student', role: 'student', name: 'Local learner', email: 'local@example.test', emailVerified: false, emailVerificationRequired: false};
  (useSessionUser as jest.Mock).mockReturnValue(user);
  (api as jest.Mock).mockImplementation(async (route: string) => {
    if (route === '/home') return {user, trending: [], popular: [], continueLearning: [], unreadNotifications: 0};
    if (route === '/me') return user;
    if (route === '/me/settings') return {learningNotifications: true, certificatePublic: false};
    return [];
  });
  await mount();
  await pressLabel('Your profile');
  expect(app.root.findAll(n => n.props.children === 'Resend verification email')).toHaveLength(0);
  expect(app.root.findAll(n => n.props.children === 'Verify your email to enroll and subscribe.')).toHaveLength(0);
  expect(app.root.findAll(n => n.props.children === 'Email verified')).toHaveLength(0);
});

test('a failed login after local signup preserves the account and offers login, not signup retry', async () => {
  (api as jest.Mock).mockResolvedValue({emailVerificationRequired: false});
  (signIn as jest.Mock).mockRejectedValueOnce(new Error('Cannot reach the server.'));
  await mount('985');
  for (const [key, value] of Object.entries({email: 'local@example.test', password: 'Strong-local-password', confirm: 'Strong-local-password'})) {
    await act(async () => app.root.findAll(n => n.props.testID === `input-${key}` && n.props.onChangeText)[0].props.onChangeText(value));
  }
  await press('1:1065');
  expect(app.root.findAll(n => n.props.testID === 'screen-818').length).toBeGreaterThan(0);
  expect(Alert.alert).toHaveBeenLastCalledWith('SALFORD', expect.stringContaining('Account created. Please log in.'));
});

test('Google Pay does not open the Google login chooser or submit a payment', async () => {
  await mount('1951');
  await act(async () =>
    app.root
      .findAll(
        n => n.props.accessibilityLabel === 'Google Pay' && n.props.onPress,
      )[0]
      .props.onPress(),
  );
  expect(app.root.findAll(n => n.props.testID === 'screen-894')).toHaveLength(
    0,
  );
  expect(
    app.root.findAll(n => n.props.testID === 'screen-1951').length,
  ).toBeGreaterThan(0);
  expect(
    (api as jest.Mock).mock.calls.some(c => c[0] === '/billing/demo-purchases'),
  ).toBe(false);
});

test('signup validates confirmation, submits no session and returns to email login', async () => {
  await mount('985');
  const input = async (key: string, value: string) =>
    act(async () =>
      app.root
        .findAll(
          n => n.props.testID === `input-${key}` && n.props.onChangeText,
        )[0]
        .props.onChangeText(value),
    );
  await input('email', 'new@example.test');
  await input('password', 'Strong-test-password');
  await input('confirm', 'different-password');
  await press('1:1065');
  expect(api).not.toHaveBeenCalled();
  await input('confirm', 'Strong-test-password');
  await press('1:1065');
  expect(api).toHaveBeenCalledWith('/auth/register', 'POST', {
    email: 'new@example.test',
    password: 'Strong-test-password',
  });
  expect(signIn).not.toHaveBeenCalled();
  expect(
    app.root.findAll(n => n.props.testID === 'screen-818').length,
  ).toBeGreaterThan(0);
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'SALFORD',
    expect.stringContaining('If this email is eligible'),
  );
});

test('unverified checkout offers email verification and cannot display success', async () => {
  (getSessionUser as jest.Mock).mockReturnValue({ email: 'new@example.test' });
  await mount('1951');
  await pressText('Fill test payment details');
  (api as jest.Mock).mockRejectedValueOnce(
    Object.assign(new Error('Verify your email'), {
      code: 'EMAIL_NOT_VERIFIED',
    }),
  );
  await press('1:2085');
  expect(app.root.findAll(n => n.props.testID === 'screen-2086')).toHaveLength(
    0,
  );
  await pressText('Resend verification email');
  expect(api).toHaveBeenLastCalledWith(
    '/auth/email/verification-requests',
    'POST',
    { email: 'new@example.test' },
  );
});

test('anonymous checkout resumes the selected plan after a real login', async () => {
  (hasSession as jest.Mock).mockReturnValue(false);
  await mount('1951');
  await pressText('Log in to continue');
  (hasSession as jest.Mock).mockReturnValue(true);
  (useSessionUser as jest.Mock).mockReturnValue({
    id: 'student',
    role: 'student',
    email: 'student@example.test',
    emailVerified: true,
  });
  await act(async () => app.update(<App />));
  expect(
    app.root.findAll(n => n.props.testID === 'screen-1951').length,
  ).toBeGreaterThan(0);
  expect(api).toHaveBeenCalledWith('/billing/demo-plans');
  expect(app.root.findAll(n => n.props.testID === 'screen-894')).toHaveLength(
    0,
  );
});

test('native lesson events save progress and completion without network calls', async () => {
  await mount('2231');
  await press('1:2272');
  const video = app.root.findAll(
    n => n.props.source && typeof n.props.onEnd === 'function',
  )[0];
  expect(video).toBeDefined();
  await act(async () =>
    video.props.onProgress({ currentTime: 9, seekableDuration: 18 }),
  );
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    'salford.learning.v2.guest',
    expect.stringContaining('"ui-ux":50'),
  );
  await act(async () => video.props.onEnd());
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    'salford.learning.v2.guest',
    expect.stringContaining('"ui-ux":100'),
  );
});

test('live search handles no results and clear filters', async () => {
  await mount('1189');
  const input = app.root.findAll(
    n => n.props.testID === 'course-search' && n.props.onChangeText,
  )[0];
  await act(async () => input.props.onChangeText('missing-course-xyz'));
  expect(
    app.root.findAll(n => n.props.children === 'No courses found').length,
  ).toBeGreaterThan(0);
  await act(async () => input.props.onChangeText('figma'));
  expect(
    app.root.findAll(
      n => n.props.accessibilityLabel === 'Open UI Design Wit Figma',
    ).length,
  ).toBeGreaterThan(0);
});

async function pressText(text: string) {
  const button = app.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.findAll(child => child.props.children === text).length > 0,
  )[0];
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
}

async function pressLabel(label: string) {
  const button = app.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityLabel === label,
  )[0];
  expect(button).toBeDefined();
  await act(async () =>
    button.props.onPress({ stopPropagation: jest.fn() }),
  );
}

test('an admin account opens the native dashboard and its read-only payment ledger', async () => {
  (useSessionUser as jest.Mock).mockReturnValue({
    id: 'admin',
    role: 'admin',
    name: 'Admin',
    email: 'admin@example.test',
    emailVerified: true,
  });
  (api as jest.Mock).mockImplementation(async (path: string) =>
    path === '/admin/overview'
      ? {
          students: 2,
          courses: 1,
          published: 1,
          enrollments: 1,
          completions: 0,
          activeDemoPayments: 0,
          demoAmountMinor: 0,
          currency: 'USD',
          activity: [],
          recentCourses: [],
        }
      : { items: [], nextCursor: null },
  );
  await mount();
  expect(
    app.root.findAll(n => n.props.testID === 'mobile-admin').length,
  ).toBeGreaterThan(0);
  await pressText('سجل الدفع');
  expect(api).toHaveBeenCalledWith(
    expect.stringContaining('/admin/demo-payments'),
  );
  expect((api as jest.Mock).mock.calls.some(c => c[1] === 'POST')).toBe(false);
});

test('a student uses server courses and enrolls before protected lesson playback', async () => {
  const user = {
    id: 'student',
    role: 'student',
    name: 'Student',
    email: 'student@example.test',
    emailVerified: true,
  };
  const course = {
    id: 'course',
    title: 'Server course',
    instructor: { name: 'Instructor' },
    category: { name: 'Development' },
    coverUrl: null,
    saved: false,
    accessType: 'free',
    canAccess: true,
    lessonCount: 1,
  };
  const enrollment = {
    id: 'enrollment',
    courseId: 'course',
    courseVersionId: 'version',
    canAccess: true,
    progressPercent: 0,
  };
  (useSessionUser as jest.Mock).mockReturnValue(user);
  (api as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/home') {
      return {
        user,
        trending: [course],
        popular: [],
        continueLearning: [],
        unreadNotifications: 0,
      };
    }
    if (path === '/courses/course') {
      return { course, description: 'Published from admin' };
    }
    if (path.includes('/curriculum')) {
      return {
        chapters: [
          {
            id: 'chapter',
            title: 'Chapter',
            lessons: [
              {
                id: 'lesson',
                title: 'Protected lesson',
                durationSeconds: 18,
                required: true,
                isPreview: false,
              },
            ],
          },
        ],
      };
    }
    if (path.includes('/progress')) {
      return { enrollment, lessons: [] };
    }
    if (path.endsWith('/enrollments')) {
      return enrollment;
    }
    return {};
  });
  await mount();
  await pressLabel('View course: Server course');
  expect(app.root.findAll(n => n.props.testID === 'mobile-admin')).toHaveLength(
    0,
  );
  await pressLabel('Protected lesson · Required · 1 min');
  expect(api).toHaveBeenCalledWith(
    '/courses/course/enrollments',
    'POST',
    undefined,
    '10000000-0000-4000-8000-000000000001',
  );
  expect(api).toHaveBeenCalledWith(
    '/courses/course/curriculum?versionId=version',
  );
});

test('server home shows loading, an offline retry, and a real empty result without demo fallback', async () => {
  const user = {id: 'student', role: 'student', name: 'QA', email: 'qa@example.test', emailVerified: true};
  (useSessionUser as jest.Mock).mockReturnValue(user);
  let fail!: (error: Error) => void;
  (api as jest.Mock).mockImplementation(() => new Promise((_, reject) => {fail = reject;}));
  await mount();
  expect(app.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  await act(async () => fail(new Error('Network offline')));
  expect(app.root.findAll(n => n.props.children === 'Network offline').length).toBeGreaterThan(0);
  (api as jest.Mock).mockResolvedValue({user, trending: [], popular: [], continueLearning: [], unreadNotifications: 0});
  await pressText('Retry / إعادة المحاولة');
  expect(app.root.findAll(n => n.props.children === 'No courses have been published yet.').length).toBeGreaterThan(0);
  expect(app.root.findAllByType(ActivityIndicator)).toHaveLength(0);
});

test('restored checkout rejects arbitrary cards without contacting payment API', async () => {
  await mount('1951');
  await pressText('Fill test payment details');
  await act(async () =>
    app.root
      .findAll(n => n.props.testID === 'input-card' && n.props.onChangeText)[0]
      .props.onChangeText('4111111111111111'),
  );
  await press('1:2085');
  expect(
    (api as jest.Mock).mock.calls.filter(
      c => c[0] === '/billing/demo-purchases',
    ),
  ).toHaveLength(0);
  expect(app.root.findAll(n => n.props.testID === 'screen-2086')).toHaveLength(
    0,
  );
});

test('native admin uploads a private cached copy with checksum and completes only after PUT success', async () => {
  (pick as jest.Mock).mockResolvedValue([
    { uri: 'content://selected-image', type: 'image/png' },
  ]);
  (keepLocalCopy as jest.Mock).mockResolvedValue([
    { status: 'success', localUri: 'file:///cache/csc-upload-abc123.png' },
  ]);
  (BlobUtil.fs.stat as jest.Mock).mockResolvedValue({ size: 120 });
  (BlobUtil.fs.hash as jest.Mock).mockResolvedValue('checksum');
  (BlobUtil.fs.unlink as jest.Mock).mockResolvedValue(undefined);
  (BlobUtil.wrap as jest.Mock).mockReturnValue('wrapped-file');
  const put = jest.fn().mockResolvedValue({ info: () => ({ status: 200 }) });
  (BlobUtil.config as jest.Mock).mockReturnValue({ fetch: put });
  (api as jest.Mock).mockImplementation(async (path: string) =>
    path.endsWith('upload-sessions')
      ? {
          assetId: 'asset',
          uploadUrl: 'http://server/upload',
          headers: { 'Content-Type': 'image/png' },
        }
      : undefined,
  );
  expect(await uploadMedia()).toBe(true);
  expect(api).toHaveBeenCalledWith('/admin/assets/upload-sessions', 'POST', {
    kind: 'image',
    mimeType: 'image/png',
    byteSize: 120,
    checksumSha256: 'checksum',
  });
  expect(put).toHaveBeenCalledWith(
    'PUT',
    'http://server/upload',
    { 'Content-Type': 'image/png' },
    'wrapped-file',
  );
  expect(api).toHaveBeenLastCalledWith('/admin/assets/asset/complete', 'POST');
  expect(BlobUtil.fs.unlink).toHaveBeenCalledWith(
    '/cache/csc-upload-abc123.png',
  );
});

test('native admin rejects unsupported files without creating upload grants', async () => {
  (pick as jest.Mock).mockResolvedValue([
    { uri: 'content://selected-document', type: 'application/pdf' },
  ]);
  await expect(uploadMedia()).rejects.toThrow('MP4');
  expect(api).not.toHaveBeenCalled();
  expect(keepLocalCopy).not.toHaveBeenCalled();
});

test('profile and settings panels keep shared state after extraction', async () => {
  await mount('1824');
  await press('1:1848');
  const nameInput = () =>
    app.root.findAll(
      n => n.props.accessibilityLabel === 'Full name' && n.props.onChangeText,
    )[0];
  await act(async () => nameInput().props.onChangeText('Sara Test'));
  await pressText('Done');
  await press('1:1848');
  expect(nameInput().props.value).toBe('Sara Test');
  await pressText('Done');
  await press('1:1869');
  const notifications = app.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Learning notifications' &&
      n.props.onValueChange,
  )[0];
  await act(async () => notifications.props.onValueChange(false));
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    'salford.learning.v2.guest',
    expect.stringContaining('"notifications":false'),
  );
  await pressText('Log out');
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(
    app.root.findAll(n => n.props.testID === 'screen-818').length,
  ).toBeGreaterThan(0);
});

test('category panel applies its filter to the search screen', async () => {
  await mount('1189');
  await press('1:1205');
  await pressText('Programming');
  expect(
    app.root.findAll(
      n => n.props.accessibilityLabel === 'Open Introduction to Programming',
    ).length,
  ).toBeGreaterThan(0);
  expect(
    app.root.findAll(
      n => n.props.accessibilityLabel === 'Open Cybersecurity Essentials',
    ),
  ).toHaveLength(0);
});

test.each([0, 18])(
  'native video resumes at %s, reports server progress and replays after ending',
  async resumePositionSeconds => {
    const confirmed = jest.fn();
    const seek = jest.fn();
    (api as jest.Mock).mockImplementation(
      async (
        path: string,
        _method: string,
        body: { events?: { eventId: string; sequence: number }[] },
      ) =>
        path.includes('/lessons/')
          ? {
              playbackSessionId: 'playback',
              streamUrl: 'http://server/video.m3u8',
              expiresAt: new Date(Date.now() + 300000).toISOString(),
              resumePositionSeconds,
              durationSeconds: 18,
              heartbeatIntervalSeconds: 15,
              progressAllowed: true,
            }
          : {
              acceptedEventIds: [body.events![0].eventId],
              nextSequence: body.events![0].sequence + 1,
              enrollment: {
                id: 'enrollment',
                progressPercent: 0,
                completed: false,
              },
            },
    );
    await act(async () => {
      app = Renderer.create(
        <Playback
          lesson={{
            id: 'lesson',
            title: 'Lesson',
            durationSeconds: 18,
            required: true,
            isPreview: false,
          }}
          enrollmentId="enrollment"
          onConfirmed={confirmed}
        />,
        {
          createNodeMock: element =>
            element.type === 'Video' ? { seek } : null,
        },
      );
    });
    const video = app.root.findAll(
      n => n.props.source?.uri && n.props.onEnd,
    )[0];
    await act(async () => video.props.onLoad());
    if (resumePositionSeconds === 18) {
      expect(seek).toHaveBeenCalledWith(0);
      expect(api).toHaveBeenLastCalledWith(
        '/playback-sessions/playback/events',
        'POST',
        {
          events: [
            expect.objectContaining({ kind: 'seek', positionSeconds: 0 }),
          ],
        },
      );
    }
    confirmed.mockClear();
    seek.mockClear();
    await act(async () => video.props.onEnd());
    expect(api).toHaveBeenCalledWith(
      '/playback-sessions/playback/events',
      'POST',
      {
        events: [
          expect.objectContaining({ kind: 'ended', positionSeconds: 18 }),
        ],
      },
    );
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(
      app.root.findAll(
        n => n.props.children === 'Server-confirmed course progress: 0%',
      ).length,
    ).toBeGreaterThan(0);
    await pressText('Replay');
    expect(seek).toHaveBeenCalledWith(0);
    expect(api).toHaveBeenLastCalledWith(
      '/playback-sessions/playback/events',
      'POST',
      {
        events: [expect.objectContaining({ kind: 'seek', positionSeconds: 0 })],
      },
    );
  },
);

test.each(['payment', 'notifications'])('student checkout routes %s to server-backed screens', async route => {
  const user = {
    id: 'student',
    name: 'Student',
    email: 'student@example.test',
    role: 'student',
    emailVerified: true,
  };
  (useSessionUser as jest.Mock).mockReturnValue(user);
  (api as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/home') {
      return {
        user,
        trending: [],
        popular: [],
        continueLearning: [],
        unreadNotifications: 0,
      };
    }
    if (path === '/me') {
      return user;
    }
    if (path === '/me/settings') {
      return { learningNotifications: true, certificatePublic: false };
    }
    if (path === '/me/subscriptions') {
      return [];
    }
    if (path === '/billing/demo-plans') {
      return [
        {
          id: 'plan-premium',
          code: 'premium',
          name: 'Premium',
          amountMinor: 2999,
          currency: 'USD',
          durationDays: 30,
        },
      ];
    }
    if (path === '/billing/demo-purchases') {
      return { status: 'succeeded' };
    }
    return { items: [], nextCursor: null };
  });
  await mount();
  await pressLabel('Your profile');
  await pressLabel('Settings');
  await pressText('Subscription plans');
  if (route === 'notifications') {
    await press('1:1887');
    expect(api).toHaveBeenCalledWith('/me/notifications?limit=20');
    expect(app.root.findAll(n => n.props.children === 'Notifications').length).toBeGreaterThan(0);
    return;
  }
  await press('1:1949');
  await pressText('Fill test payment details');
  await press('1:2085');
  await press('1:2229');
  expect(app.root.findAll(n => n.props.testID === 'screen-1479').length).toBeGreaterThan(0);
  expect(api).toHaveBeenCalledWith('/me/courses?limit=20');
});

