import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { DesignNode, SCREEN, ScreenId, theme } from './design/types';
import { Action, DesignScene, DynamicText } from './components/DesignScene';
import { LessonPlayer } from './components/LessonPlayer';
import { sheetStyles as ss } from './components/Sheet';
import { courses, searchCourses, validateCredentials } from './data/courses';
import { useLearningState } from './state/useLearningState';
import { images } from './assets/images';
import {
  screens,
  screenIds,
  findNode,
  FLOATS,
  type Panel,
  notice,
  inScreens,
  defaultProfile,
} from './app/screen-config';
import { styles } from './app/styles';
import { getFormFields } from './app/form-fields';
import { LearningPanels } from './panels/LearningPanels';
import { DemoCheckout, paymentHidden } from './components/DemoCheckout';
import { api, hasSession, signIn, useSessionUser } from './services/api';
import { AdminApp } from './admin/AdminApp';
import { StudentApp } from './learning/StudentApp';

function LearningApp({
  billingExit,
  checkoutPlan,
  onLoginRequired,
}: {
  billingExit?: (openCourses?: boolean, openNotifications?: boolean) => void;
  checkoutPlan?: 'Basic' | 'Pro' | 'Premium';
  onLoginRequired?: (plan: 'Basic' | 'Pro' | 'Premium') => void;
}) {
  const {
    state,
    setState,
    ready,
    storageError,
    toggleBookmark,
    recordProgress,
  } = useLearningState();
  const [stack, setStack] = useState<ScreenId[]>([
    billingExit
      ? checkoutPlan
        ? SCREEN.payment
        : SCREEN.plans
      : SCREEN.splash,
  ]);
  const current = stack[stack.length - 1];
  const [panel, setPanel] = useState<Panel>(''),
    [form, setForm] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true),
    [showPassword, setShowPassword] = useState(false);
  const [category, setCategory] = useState('All'),
    [query, setQuery] = useState(''),
    [chosen, setChosen] = useState('');
  const [plan, setPlan] = useState<'Basic' | 'Pro' | 'Premium'>(
    checkoutPlan || 'Premium',
  );
  const [planPrices, setPlanPrices] = useState<Record<string, number>>({});
  const [planNames, setPlanNames] = useState<Record<string, string>>({});
  const [planFeatures, setPlanFeatures] = useState<Record<string, string[]>>({});
  const [planDurations, setPlanDurations] = useState<Record<string, number>>({});
  const [planCourseCounts, setPlanCourseCounts] = useState<Record<string, number>>({});
  const authPending = useRef(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [playing, setPlaying] = useState(false),
    [lesson, setLesson] = useState(0),
    [message, setMessage] = useState('');
  const [profile, setProfile] = useState(defaultProfile);
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null),
    size = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const width = Math.min(size.width, 600),
    scale = width / 390,
    scene = screens[current];
  const hasStatus = !inScreens(current, [
    SCREEN.splash,
    SCREEN.welcome,
    SCREEN.onboarding1,
    SCREEN.onboarding2,
    SCREEN.onboarding3,
    SCREEN.login,
    SCREEN.google,
    SCREEN.signup,
  ]);
  const origin = hasStatus ? 30 : 0,
    availableHeight = size.height - insets.top - insets.bottom,
    bodyHeight = Math.max(844 - origin, availableHeight / scale);
  const chosenCourse = courses.find(c => c.id === chosen),
    currentCourse = chosen || 'ui-ux';
  const go = useCallback(
    (id: ScreenId, replace = false) => {
      if (
        billingExit &&
        !inScreens(id, [SCREEN.plans, SCREEN.payment, SCREEN.success])
      ) {
        billingExit(id === SCREEN.courses);
        return;
      }
      Keyboard.dismiss();
      setPanel('');
      setMessage('');
      setPlaying(false);
      setStack(s => (replace ? [id] : [...s, id]));
    },
    [billingExit],
  );
  const keyboardOpen = useRef(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardOpen.current = true;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpen.current = false;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const back = useCallback(() => {
    if (keyboardOpen.current) {
      Keyboard.dismiss();
      return true;
    }
    if (panel) {
      setPanel('');
      return true;
    }
    if (stack.length > 1) {
      setStack(s => s.slice(0, -1));
      setPlaying(false);
      return true;
    }
    if (!inScreens(current, [SCREEN.home, SCREEN.login, SCREEN.welcome])) {
      go(SCREEN.home, true);
      return true;
    }
    return false;
  }, [panel, stack.length, current, go]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [current]);
  useEffect(() => {
    if (current !== SCREEN.plans || !hasSession()) {
      return;
    }
    let active = true;
    api<{ code: string; name: string; amountMinor: number; features: string[]; durationDays: number; courseIds: string[] }[]>(
      '/billing/demo-plans',
    )
      .then(plans => {
        if (active) {
          setPlanPrices(
            Object.fromEntries(plans.map(p => [p.code, p.amountMinor])),
          );
          setPlanNames(Object.fromEntries(plans.map(p => [p.code, p.name])));
          setPlanFeatures(Object.fromEntries(plans.map(p => [p.code, p.features])));
          setPlanDurations(Object.fromEntries(plans.map(p => [p.code, p.durationDays])));
          setPlanCourseCounts(Object.fromEntries(plans.map(p => [p.code, p.courseIds.length])));
        }
      })
      .catch(() => {
        if (active) {
          setPlanPrices({});
          setPlanFeatures({});
          setPlanDurations({});
          setPlanCourseCounts({});
        }
      });
    return () => {
      active = false;
    };
  }, [current]);
  useEffect(() => {
    if (!ready || current !== SCREEN.splash) {
      return;
    }
    const timer = setTimeout(
      () => go(state.onboarded ? SCREEN.login : SCREEN.welcome, true),
      1400,
    );
    return () => clearTimeout(timer);
  }, [ready, current, state.onboarded, go]);
  useEffect(() => {
    if (!__DEV__ || billingExit) {
      return;
    }
    const open = (url: string | null | undefined) => {
      const id = url?.match(/^salford:\/\/preview\/(\d+)$/)?.[1];
      if (id && screenIds.has(id)) {
        go(id as ScreenId, true);
      }
    };
    Linking.getInitialURL()
      .then(open)
      .catch(() => {});
    const sub = Linking.addEventListener('url', e => open(e.url));
    return () => sub.remove();
  }, [go, billingExit]);
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [message]);
  const completeOnboarding = () => {
    setState(s => ({ ...s, onboarded: true }));
    go(SCREEN.login, true);
  };
  const openCourse = (id: string, player = false) => {
    setChosen(id);
    go(player ? SCREEN.player : SCREEN.details);
  };
  const bookmark = (id: string) => {
    toggleBookmark(id);
    setMessage(
      state.bookmarks.includes(id)
        ? 'Removed from saved courses'
        : 'Course saved',
    );
  };
  const authenticate = async (signup = false) => {
    if (authPending.current) {
      return;
    }
    const error = validateCredentials(
      form.email || '',
      form.password || '',
      signup ? form.confirm || '' : undefined,
    );
    if (error) {
      notice(error);
      return;
    }
    authPending.current = true;
    setAuthBusy(true);
    try {
      if (signup) {
        if (form.password.length < 12) {
          notice('Use at least 12 characters for your password.');
          return;
        }
        const registration = await api<{ emailVerificationRequired?: boolean }>('/auth/register', 'POST', {
          email: form.email.trim(),
          password: form.password,
        });
        if (registration.emailVerificationRequired !== false) {
          setForm(remember ? { email: form.email.trim() } : {});
          go(SCREEN.login, true);
          notice('If this email is eligible, a verification email was prepared. Verify your email, then log in.');
          return;
        }
        // A local account still authenticates against its stored password hash.
        // If the login request fails, keep the account and let the user log in again.
        try {
          await signIn(form.email.trim(), form.password);
        } catch (loginError) {
          setForm(remember ? { email: form.email.trim() } : {});
          go(SCREEN.login, true);
          notice(`Account created. Please log in. ${(loginError as Error).message}`);
          return;
        }
        setState(s => ({ ...s, plan: null }));
        setForm(remember ? { email: form.email.trim() } : {});
        go(SCREEN.home, true);
      } else {
        const user = await signIn(form.email.trim(), form.password);
        setProfile(p => ({ ...p, name: user.name, email: user.email }));
        setState(s => ({ ...s, plan: null }));
        setForm(remember ? { email: form.email.trim() } : {});
        go(SCREEN.home, true);
      }
    } catch (e) {
      notice((e as Error).message);
    } finally {
      authPending.current = false;
      setAuthBusy(false);
    }
  };
  const actions: Record<string, Action> = {},
    hidden = new Set<string>(),
    selected = new Set<string>();
  const replacements: Record<string, React.ReactNode> = {};
  const bind = (
    ids: string | number | (string | number)[],
    label: string,
    run: () => void,
    disabled = false,
  ) => {
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      actions[typeof id === 'number' ? `1:${id}` : id] = { label, run, disabled };
    }
  };
  const replaceText = (id: string | number, text: string) => {
    const key = typeof id === 'number' ? `1:${id}` : id,
      n = findNode(scene, key);
    if (n) {
      replacements[key] = <DynamicText text={text} node={n} scale={scale} />;
    }
  };
  const walk = (n: DesignNode) => {
    if (n.name === 'system/ios/statusbar') {
      hidden.add(n.id);
    }
    n.children?.forEach(walk);
  };
  walk(scene);
  const floatingId = FLOATS[current];
  if (floatingId) {
    hidden.add(floatingId);
  }
  if (current === SCREEN.navigation) {
    hidden.add('1:2418');
  }
  bind([1373, 1563, 1832, 1882, 1959, 2094, 2282], 'Go back', back);
  bind([1092, 2325, 1378, 1568, 1837, 1887, 1964, 2099], 'Notifications', () =>
    billingExit ? billingExit(false, true) : setPanel('notifications'),
  );
  bind([1099, 2332], 'Your profile', () => go(SCREEN.profile));
  bind(419, 'Get started', () => go(SCREEN.onboarding1));
  bind(559, 'Next', () => go(SCREEN.onboarding2));
  bind(802, 'Next', () => go(SCREEN.onboarding3));
  bind([560, 803, 817], 'Start learning', completeOnboarding);
  bind(893, 'Log in', () => authenticate(), authBusy);
  bind(1065, 'Create account', () => authenticate(true), authBusy);
  bind([835, 911], 'Sign up', () => {
    setForm({});
    go(SCREEN.signup);
  });
  bind(994, 'Already registered? Log in', () => {
    setForm({});
    go(SCREEN.login, true);
  });
  bind(825, 'Remember email for this session', () => setRemember(v => !v));
  bind(830, 'Forgot password', () => setPanel('forgot'));
  // No native OAuth integration is configured: preserve artwork, disable actions.
  bind([837, 913], 'Google sign-in unavailable: not configured', () => {}, true);
  bind([844, 920], 'Apple sign-in unavailable: not configured', () => {}, true);
  if (current === SCREEN.signup) {
    replacements['1:994'] = (
      <Text style={[styles.authFooter, { fontSize: 16 * scale }]}>
        Joined us before? <Text style={styles.authFooterLink}>Log In</Text>
      </Text>
    );
  }
  bind(970, 'Close account chooser', back);
  // The Figma chooser is artwork, never an authenticated account.
  bind(975, 'Log in with email', () => go(SCREEN.login, true));
  bind(979, 'Use email instead', () => go(SCREEN.login, true));
  const showCategory = (value = 'All') => {
    setQuery('');
    setCategory(value);
    go(SCREEN.search);
  };
  bind([1100, 2333], 'Search courses', () => showCategory());
  bind([1108, 2341, 1205], 'Filter courses', () => setPanel('filters'));
  bind([1137, 1163, 2370, 2396], 'See all courses', () => showCategory());
  bind([1127, 2360], 'Graphic Design courses', () =>
    showCategory('Graphic Design'),
  );
  (
    [
      [1121, 2354, 'UI & UX'],
      [1123, 2356, 'Animation'],
      [1125, 2358, 'Graphic Design'],
    ] as const
  ).forEach(([a, b, c]) => bind([a, b], `${c} courses`, () => showCategory(c)));
  bind([1139, 1165, 2372, 2398], 'Open Visual Design', () =>
    openCourse('visual-design'),
  );
  bind([1149, 1175, 2382, 2408, 1142, 2375], 'Open UX research', () =>
    openCourse('ux-research'),
  );
  bind([1145, 1171, 2378, 2404], 'Save Visual Design', () =>
    bookmark('visual-design'),
  );
  bind([1155, 1181, 2388, 2414], 'Save UX research', () =>
    bookmark('ux-research'),
  );
  bind([1217, '3002:217'], 'Open Introduction to Programming', () =>
    openCourse('programming'),
  );
  bind(1228, 'Open Cybersecurity Essentials', () =>
    openCourse('cybersecurity'),
  );
  bind(1239, 'Open programming course', () => openCourse('programming'));
  bind([1223, '3002:223', 1245, 1246], 'Save Introduction to Programming', () =>
    bookmark('programming'),
  );
  bind(1234, 'Save Cybersecurity Essentials', () => bookmark('cybersecurity'));
  bind([1399, 1419, 1439, 1459, 1346, 1390, 1392], 'Play course', () =>
    go(SCREEN.player),
  );
  if (chosenCourse && inScreens(current, [SCREEN.details, SCREEN.player])) {
    replaceText(current === SCREEN.details ? 1397 : 2302, chosenCourse.title);
  }
  bind(1579, 'Continue Introduction to Programming', () =>
    openCourse('programming', true),
  );
  bind(1618, 'Continue UI Design Wit Figma', () => openCourse('figma', true));
  bind(1480, 'Continue Build Own Portfolio', () =>
    openCourse('portfolio', true),
  );
  bind(1518, 'Continue Advance Prototyping', () =>
    openCourse('prototyping', true),
  );
  for (const [id, c, bar] of [
    [1607, 'programming', 1612],
    [1645, 'figma', 1650],
    [1507, 'portfolio', 1512],
    [1545, 'prototyping', 1550],
  ] as const) {
    if (state.progress[c] !== undefined) {
      replaceText(id, `${state.progress[c]}%`);
      replacements[`1:${bar}`] = (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: state.progress[c] }}
          style={{
            width: 310 * scale,
            height: 12 * scale,
            borderRadius: 6 * scale,
            backgroundColor: '#E5E5E7',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${state.progress[c]}%`,
              height: 12 * scale,
              borderRadius: 6 * scale,
              backgroundColor: theme.teal,
            }}
          />
        </View>
      );
    }
  }
  bind(1854, 'Your current courses', () => go(SCREEN.courses));
  bind(1859, 'Learning history', () => setPanel('history'));
  bind(1864, 'Certificates earned', () => setPanel('certificates'));
  bind(1869, 'Settings', () => setPanel('settings'));
  bind([1848, 1849, 1850], 'Edit demo profile', () => setPanel('profile'));
  if (profile.name !== defaultProfile.name) {
    replaceText(1851, profile.name);
    replaceText(
      current === SCREEN.navigation ? 2323 : 1090,
      `Hello, ${profile.name.split(' ')[0]}`,
    );
  }
  if (profile.email !== defaultProfile.email) {
    replaceText(1852, profile.email);
  }
  bind(1899, 'Select Basic plan', () => setPlan('Basic'));
  bind(1905, 'Select Pro plan', () => setPlan('Pro'));
  bind(1911, 'Select Premium plan', () => setPlan('Premium'));
  if (plan !== 'Premium') {
    selected.add(plan === 'Basic' ? '1:1899' : '1:1905');
  }
  bind(1949, `Subscribe to ${plan}`, () => {
    setForm({});
    go(SCREEN.payment);
  });
  if (current === SCREEN.payment) {
    paymentHidden.forEach(id => hidden.add(id));
  }
  if (current === SCREEN.success) {
    replaceText(2228, 'Demo payment successful.\nNo money was charged.');
  }
  if (current === SCREEN.plans) {
    replaceText(1898, 'Choose a plan. All payments are simulated.');
    for (const [code, id] of [
      ['basic', 1903],
      ['pro', 1909],
      ['premium', 1915],
    ] as const) {
      if (planNames[code]) {
        replaceText(id, planNames[code]);
      }
    }
    [
      ['basic', 1901],
      ['pro', 1907],
      ['premium', 1917],
    ].forEach(([code, id]) => {
      const amount = planPrices[String(code)];
      replaceText(
        id,
        amount === undefined
          ? 'See checkout'
          : `$${(amount / 100).toFixed(2)} / 30 days`,
      );
    });
    for (const [code, descriptionId] of [['basic', 1904], ['pro', 1910], ['premium', 1916]] as const) {
      replaceText(descriptionId, planFeatures[code]?.join(' · ') || 'Plan details unavailable.');
    }
    const premium = [
      ...(planFeatures.premium || []),
      planCourseCounts.premium === undefined ? '' : `${planCourseCounts.premium} courses included`,
      planDurations.premium ? `${planDurations.premium}-day access` : '',
      'Local test payment',
    ].filter(Boolean);
    [1924, 1930, 1936, 1942, 1948].forEach((id, index) =>
      replaceText(id, premium[index] || (index === 2 && planDurations.premium ? `${planDurations.premium}-day access` : '')),
    );
  }
  bind(2229, 'Go to courses', () => go(SCREEN.courses, true));
  bind(2221, 'Return to checkout', back);
  bind(2272, 'Play demo lesson', () => setPlaying(true));
  [2233, 2246, 2259].forEach((id, index) =>
    bind(id, `Play lesson ${index + 1}`, () => {
      setLesson(index);
      setPlaying(true);
    }),
  );
  if (playing) {
    // Do not wrap native video controls in the poster's Pressable.
    delete actions['1:2272'];
    replacements['1:2272'] = (
      <LessonPlayer
        key={`${currentCourse}-${lesson}`}
        scale={scale}
        initialProgress={state.progress[currentCourse] || 0}
        onProgress={p => recordProgress(currentCourse, p)}
        onComplete={() => {
          recordProgress(currentCourse, 100);
          setMessage('Demo lesson complete — certificate available in Profile');
        }}
      />
    );
  }
  bind(2420, 'Close navigation', back);
  bind(2424, 'Saved courses', () => setPanel('bookmarks'));
  bind(2429, 'Profile', () => go(SCREEN.profile));
  bind(2438, 'My courses', () => go(SCREEN.courses));
  bind(2442, 'Settings', () => setPanel('settings'));
  bind([2437, 2447], 'Home', () => go(SCREEN.home, true));
  const { fields, hidden: fieldNodes } = getFormFields(current);
  fieldNodes.forEach(id => hidden.add(id));
  const dynamicSearch =
    current === SCREEN.search && (!!query.trim() || category !== 'All');
  const results = useMemo(
    () => searchCourses(query, category),
    [query, category],
  );
  if (current === SCREEN.search) {
    hidden.add('1:1204');
    if (dynamicSearch) {
      ['1:1217', '3002:217', '1:1228', '1:1239'].forEach(id => hidden.add(id));
    }
  }
  const contentHeight = Math.max(
    bodyHeight,
    current === SCREEN.home || current === SCREEN.navigation
      ? 1130 - origin
      : current === SCREEN.search
      ? (dynamicSearch ? 160 + results.length * 275 + 120 : 1040) - origin
      : current === SCREEN.courses
      ? 1080 - origin
      : current === SCREEN.payment
      ? 920 - origin
      : 844 - origin,
  );
  const primaryFloat = floatingId ? findNode(scene, floatingId) : undefined,
    navNode =
      current === SCREEN.navigation ? findNode(scene, '1:2418') : undefined;
  return (
    <View
      style={[
        styles.app,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.grow}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{ width, flex: 1, alignSelf: 'center', overflow: 'hidden' }}
        >
          <ScrollView
            ref={scroll}
            testID={`screen-${current}`}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ height: contentHeight * scale }}
            scrollEnabled={
              !inScreens(current, [
                SCREEN.splash,
                SCREEN.google,
                SCREEN.success,
              ])
            }
          >
            <View
              style={{
                position: 'absolute',
                top: -origin * scale,
                left: 0,
                width,
                height: contentHeight * scale,
              }}
            >
              <DesignScene
                node={scene}
                scale={scale}
                actions={actions}
                hidden={hidden}
                replacements={replacements}
                selected={selected}
                root
              />
              {fields.map(field => (
                <TextInput
                  key={`${current}-${field.key}`}
                  testID={`input-${field.key}`}
                  accessibilityLabel={field.label}
                  value={form[field.key] || ''}
                  editable={!authBusy}
                  placeholder={field.placeholder}
                  placeholderTextColor="#8A8995"
                  onChangeText={value =>
                    setForm(f => ({ ...f, [field.key]: value }))
                  }
                  secureTextEntry={!!field.secure && !showPassword}
                  keyboardType={field.keyboard || 'default'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={field.max || 100}
                  selectionColor={theme.teal}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={[
                    styles.field,
                    {
                      left: field.x * scale,
                      top: field.y * scale,
                      width: field.w * scale,
                      height: 38 * scale,
                      fontSize: 13 * scale,
                    },
                  ]}
                />
              ))}
              {inScreens(current, [SCREEN.login, SCREEN.signup]) &&
                [331, ...(current === SCREEN.signup ? [407] : [])].map(y => (
                  <Pressable
                    key={y}
                    accessibilityLabel={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    onPress={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute',
                      left: 322 * scale,
                      top: y * scale,
                      width: 40 * scale,
                      height: 38 * scale,
                    }}
                  />
                ))}
              {current === SCREEN.login && !remember && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 20 * scale,
                    top: 486 * scale,
                    width: 32 * scale,
                    height: 18 * scale,
                    borderRadius: 9 * scale,
                    backgroundColor: '#C4C7CA',
                  }}
                />
              )}
              {current === SCREEN.search && (
                <TextInput
                  testID="course-search"
                  accessibilityLabel="Search courses"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search Course"
                  placeholderTextColor="#818198"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.field,
                    {
                      left: 68 * scale,
                      top: 85 * scale,
                      width: 240 * scale,
                      height: 40 * scale,
                      fontSize: 14 * scale,
                    },
                  ]}
                />
              )}
              {dynamicSearch && (
                <View
                  style={{
                    position: 'absolute',
                    left: 20 * scale,
                    top: 160 * scale,
                    width: 350 * scale,
                  }}
                >
                  {!results.length && (
                    <View style={styles.empty}>
                      <Text style={styles.emptyTitle}>No courses found</Text>
                      <Text style={ss.text}>
                        Try a different title or category.
                      </Text>
                      <Pressable
                        onPress={() => {
                          setCategory('All');
                          setQuery('');
                        }}
                      >
                        <Text style={styles.link}>Clear filters</Text>
                      </Pressable>
                    </View>
                  )}
                  {results.map(c => (
                    <View key={c.id} style={{ height: 275 * scale }}>
                      <Pressable
                        onPress={() => openCourse(c.id)}
                        accessibilityLabel={`Open ${c.title}`}
                      >
                        <Image
                          source={
                            images[c.image] || images[Object.keys(images)[0]]
                          }
                          style={{
                            width: 350 * scale,
                            height: 201 * scale,
                            borderRadius: 30 * scale,
                          }}
                        />
                        <View
                          style={[
                            styles.price,
                            { left: 12 * scale, top: 12 * scale },
                          ]}
                        >
                          <Text style={styles.priceText}>$250</Text>
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.courseTitle,
                            { fontSize: 18 * scale, marginTop: 10 * scale },
                          ]}
                        >
                          {c.title}
                        </Text>
                        <Text style={[styles.small, { color: theme.teal }]}>
                          By: {c.author}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Save ${c.title}`}
                        onPress={() => bookmark(c.id)}
                        style={[
                          styles.save,
                          { right: 12 * scale, top: 149 * scale },
                        ]}
                      >
                        <Text style={styles.link}>
                          {state.bookmarks.includes(c.id) ? '♥' : '♡'}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {current === SCREEN.payment && (
                <DemoCheckout
                  plan={plan}
                  scale={scale}
                  onLogin={() => {
                    onLoginRequired?.(plan);
                    setForm({});
                    go(SCREEN.login, true);
                  }}
                  onSuccess={() => {
                    setState(s => ({ ...s, plan }));
                    go(SCREEN.success);
                  }}
                />
              )}
            </View>
          </ScrollView>
          {primaryFloat && (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: 0,
                top: availableHeight - 115 * scale,
                width,
                height: 72 * scale,
              }}
            >
              <DesignScene
                node={{ ...primaryFloat, x: 159, y: 0 }}
                scale={scale}
                actions={{
                  [primaryFloat.id]: {
                    label: 'Open navigation',
                    run: () => go(SCREEN.navigation),
                  },
                }}
              />
            </View>
          )}
          {navNode && (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: 0,
                top: availableHeight - 174 * scale,
                width,
                height: 254 * scale,
              }}
            >
              <DesignScene
                node={{ ...navNode, x: 68, y: 0 }}
                scale={scale}
                actions={actions}
              />
            </View>
          )}
          {!!message && (
            <View
              pointerEvents="none"
              accessibilityLiveRegion="polite"
              style={styles.toast}
            >
              <Text style={styles.toastText}>{message}</Text>
            </View>
          )}
          {authBusy && (
            <View style={styles.toast} accessibilityLiveRegion="polite">
              <ActivityIndicator color="white" />
              <Text style={styles.toastText}>Signing in / Creating account…</Text>
            </View>
          )}
          {storageError && (
            <Text style={styles.storageError}>
              Local storage unavailable. Changes last for this session.
            </Text>
          )}
          {__DEV__ && (
            <Pressable
              accessibilityLabel="Open Figma screen gallery"
              onLongPress={() => setPanel('gallery')}
              delayLongPress={650}
              style={styles.galleryTarget}
            />
          )}
        </View>
      </KeyboardAvoidingView>
      <LearningPanels
        panel={panel}
        setPanel={setPanel}
        current={current}
        go={go}
        openCourse={openCourse}
        state={state}
        setState={setState}
        category={category}
        setCategory={setCategory}
        form={form}
        setForm={setForm}
        profile={profile}
        setProfile={setProfile}
        setMessage={setMessage}
      />
    </View>
  );
}
function SessionApp() {
  const user = useSessionUser();
  const [checkoutPlan, setCheckoutPlan] = useState<
    'Basic' | 'Pro' | 'Premium'
  >();
  return user?.role === 'admin' ? (
    <AdminApp key={user.id} user={user} />
  ) : user ? (
    <StudentApp
      key={user.id}
      user={user}
      initialBilling={!!checkoutPlan}
      renderBilling={close => (
        <LearningApp
          checkoutPlan={checkoutPlan}
          billingExit={(openCourses, openNotifications) => {
            setCheckoutPlan(undefined);
            close(openCourses, openNotifications);
          }}
        />
      )}
    />
  ) : (
    <LearningApp key="guest" onLoginRequired={setCheckoutPlan} />
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <SessionApp />
    </SafeAreaProvider>
  );
}
