import { useData } from '../services/useData';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, Text, View } from 'react-native';
import { api, mediaUrl, requestId, signOut, type SessionUser } from '../services/api';
import { Data, Dialog, ErrorBox, Field, Pager, Toggle, date } from '../components/NativeUI';
import type { Certificate, Course, CourseDetail, Curriculum, Enrollment, Lesson, LibraryItem, Notification } from './types';
import { Playback } from './Playback';
import { Home } from './FigmaHome';
import { SCREEN } from '../design/types';
import { screens } from '../app/screen-config';
import { adapt, Avatar, Button, Categories, CourseCard, CurriculumCard, Fragment, Header, node, SearchField,
  StudentLayout, s as ui, textSlots, useDesignScale, useScrollTop } from './FigmaUI';

type Page = 'home' | 'search' | 'courses' | 'bookmarks' | 'history' | 'profile' | 'certificates' | 'notifications' | 'settings';
type Route = { page: Page; category?: string } | { page: 'detail'; course: Course; enrollment?: Enrollment };

export function StudentApp({ user, renderBilling, initialBilling = false }: {
  user: SessionUser; renderBilling: (close: (openCourses?: boolean, openNotifications?: boolean) => void) => React.ReactNode;
  initialBilling?: boolean;
}) {
  const [routes, setRoutes] = useState<Route[]>([{ page: 'home' }]);
  const [billing, setBilling] = useState(initialBilling), [revision, setRevision] = useState(0);
  const [navigation, setNavigation] = useState(false);
  const route = routes[routes.length - 1];
  const go = (value: Route) => { setNavigation(false); setRoutes(r => [...r, value]); };
  const closeBilling = useCallback((openCourses?: boolean, openNotifications?: boolean) => {
    setBilling(false); setRevision(n => n + 1);
    if (openNotifications) { setRoutes([{ page: 'notifications' }]); }
    else if (openCourses) { setRoutes([{ page: 'courses' }]); }
  }, []);
  const back = useCallback(() => {
    if (navigation) { setNavigation(false); return true; }
    if (routes.length > 1) { setRoutes(r => r.slice(0, -1)); return true; }
    if (routes[0].page !== 'home') { setRoutes([{ page: 'home' }]); return true; }
    return false;
  }, [navigation, routes]);
  useEffect(() => {
    if (billing) { return; }
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back, billing]);
  const open = (course: Course, enrollment?: Enrollment) => go({ page: 'detail', course, enrollment });
  if (billing) { return renderBilling(closeBilling); }
  const title = { home: '', search: 'Search Course', courses: 'My Courses', bookmarks: 'Saved Courses', history: 'Your History',
    profile: 'Profile', certificates: 'Certifications Earned', notifications: 'Notifications', detail: 'Course Details', settings: 'Settings' }[route.page];
  const screen = { home: SCREEN.home, search: SCREEN.search, courses: SCREEN.courses, profile: SCREEN.profile,
    detail: SCREEN.details, bookmarks: 'bookmarks', history: 'history', certificates: 'certificates', notifications: 'notifications', settings: 'settings' }[route.page];
  const subscribe = () => setBilling(true);
  return <StudentLayout key={`${routes.length}:${route.page}`} screen={screen} navigation={navigation}
    closeNavigation={() => setNavigation(v => !v)} onNavigation={page => { setNavigation(false); setRoutes([{ page }]); }}
    refresh={() => setRevision(v => v + 1)}>
    <View key={revision}>
      {route.page !== 'home' && route.page !== 'search' && route.page !== 'detail' &&
        <Header title={title} back={back} notifications={() => go({ page: 'notifications' })} />}
      {route.page === 'home' && <Home open={open} profile={() => go({ page: 'profile' })}
        notifications={() => go({ page: 'notifications' })} search={category => go({ page: 'search', category })} />}
      {route.page === 'search' && <Catalog open={open} initialCategory={route.category} />}
      {route.page === 'bookmarks' && <Content><Pager<Course> path="/me/bookmarks"
        render={c => <CourseCard key={c.id} course={c} open={() => open(c)} />} /></Content>}
      {(route.page === 'courses' || route.page === 'history') && <Content><Pager<LibraryItem>
        path={route.page === 'courses' ? '/me/courses' : '/me/history'} render={item => <CourseCard key={item.enrollment.id}
          course={item.course} progress={item.enrollment.progressPercent} open={() => open(item.course, item.enrollment)} />} /></Content>}
      {route.page === 'detail' && <Details course={route.course} initialEnrollment={route.enrollment} subscribe={subscribe}
        back={back} notifications={() => go({ page: 'notifications' })} />}
      {route.page === 'profile' && <Profile user={user} go={go} />}
      {route.page === 'settings' && <Content><AccountSettings user={user} go={go} subscribe={subscribe} /></Content>}
      {route.page === 'certificates' && <Content><Certificates /></Content>}
      {route.page === 'notifications' && <Content><Notifications go={go} subscribe={subscribe} /></Content>}
    </View>
  </StudentLayout>;
}
function Content({ children }: { children: React.ReactNode }) {
  const scale = useDesignScale();
  return <View style={{ marginHorizontal: 20 * scale, gap: 15 * scale }}>{children}</View>;
}
function Catalog({ open, initialCategory = '' }: { open: (course: Course) => void; initialCategory?: string }) {
  const [q, setQ] = useState(''), [category, setCategory] = useState(initialCategory), [filters, setFilters] = useState(false);
  const result = useData<{ id: string; name: string }[]>('/categories');
  const scale = useDesignScale();
  return <View style={{ marginHorizontal: 20 * scale, marginTop: 50 * scale }}>
    <SearchField value={q} onChange={setQ} filter={() => setFilters(v => !v)} />
    {(filters || !!category) && <View style={{ marginTop: 20 * scale }}><Data result={result}>{categories =>
      <Categories categories={[{ id: '', name: 'All' }, ...categories]} selected={category} select={setCategory} />
    }</Data></View>}
    <View style={{ marginTop: 30 * scale }}><Pager<Course>
      path={`/courses?q=${encodeURIComponent(q)}${category ? `&categoryId=${encodeURIComponent(category)}` : ''}`}
      render={c => <CourseCard key={c.id} course={c} open={() => open(c)} />} /></View>
  </View>;
}

function Details({ course, initialEnrollment, subscribe, back, notifications }: {
  course: Course; initialEnrollment?: Enrollment; subscribe: () => void; back: () => void; notifications: () => void;
}) {
  const detail = useData<CourseDetail>(`/courses/${course.id}`);
  const [enrollment, setEnrollment] = useState(initialEnrollment), [lesson, setLesson] = useState<Lesson>();
  const [actionError, setActionError] = useState(''), [actionBusy, setActionBusy] = useState(false);
  const enrollmentKey = useRef(requestId());
  const progress = useData<{ enrollment: Enrollment; lessons: { lessonId: string; completed: boolean }[] }>(
    enrollment ? `/me/enrollments/${enrollment.id}/progress` : null);
  const curriculum = useData<Curriculum>(`/courses/${course.id}/curriculum${enrollment ? `?versionId=${enrollment.courseVersionId}` : ''}`);
  const accessible = progress.data?.enrollment.canAccess ?? detail.data?.course.canAccess ?? course.canAccess;
  const scale = useDesignScale();
  const scrollToTop = useScrollTop();
  useEffect(() => { scrollToTop(); }, [lesson, scrollToTop]);
  // Back within the player returns to the selected course without losing enrollment.
  useEffect(() => {
    if (!lesson) { return; }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setLesson(undefined); return true; });
    return () => sub.remove();
  }, [lesson]);
  const value = detail.data?.course || course;
  const chapters = curriculum.data?.chapters || [];
  const lessons = chapters.flatMap(ch => ch.lessons);
  const openLesson = async (next: Lesson) => {
    if (!accessible && !next.isPreview) { subscribe(); return; }
    if (accessible && !enrollment) {
      if (actionBusy) { return; }
      setActionBusy(true); setActionError('');
      try {
        const created = await api<Enrollment>(`/courses/${course.id}/enrollments`, 'POST', undefined, enrollmentKey.current);
        setEnrollment(created);
      } catch (error) {
        setActionError((error as Error).message); return;
      } finally { setActionBusy(false); }
    }
    setLesson(next);
  };
  if (lesson) {
    return <CoursePlayer course={value} description={detail.data?.description || ''} curriculum={curriculum.data}
      lesson={lesson} enrollment={enrollment} accessible={accessible} progress={progress.data?.enrollment.progressPercent}
      back={() => setLesson(undefined)} select={next => { void openLesson(next); }} confirmed={progress.reload} />;
  }
  const heading = adapt(node(SCREEN.details, '1:1394'), {
    '1:1396': { w: 274 }, '1:1397': { w: 350 }, '1:1398': { w: 350, h: 38 },
  });
  const counts = node(SCREEN.details, '1:1389');
  return <>
    <Header title="Course Details" back={back} notifications={notifications} />
    <Content>
      <Fragment source={heading} replacements={textSlots(heading, {
        '1:1396': value.category.name,
        '1:1397': value.title,
        '1:1398': detail.data?.description || '',
      }, ['1:1397'])} />
      <View style={{ marginTop: 20 * scale }}><Fragment source={counts} replacements={textSlots(counts, {
        '1:1391': `${value.lessonCount} ${value.lessonCount === 1 ? 'Lesson' : 'Lessons'}`,
        '1:1393': `${chapters.length} ${chapters.length === 1 ? 'Chapter' : 'Chapters'}`,
      })} /></View>
      <ErrorBox message={detail.error || curriculum.error || actionError} retry={detail.error ? detail.reload : curriculum.reload} />
      <View style={{ marginTop: 15 * scale }}>
        {lessons.map(next => <CurriculumCard key={next.id} title={next.title}
          lessons={next.isPreview ? 'Preview' : next.required ? 'Required' : 'Optional'}
          status={progress.data?.lessons.find(p => p.lessonId === next.id)?.completed ? '✓ Completed' : ''}
          duration={`${Math.max(1, Math.ceil(next.durationSeconds / 60))} min`}
          disabled={actionBusy} open={() => { void openLesson(next); }} />)}
      </View>
    </Content>
  </>;
}

function CoursePlayer({ course, description, curriculum, lesson, enrollment, accessible, progress, back, select, confirmed }: {
  course: Course; description: string; curriculum?: Curriculum; lesson: Lesson; enrollment?: Enrollment;
  accessible: boolean; progress?: number; back: () => void; select: (lesson: Lesson) => void; confirmed: () => void;
}) {
  const scale = useDesignScale();
  const source = adapt(screens[SCREEN.player], { '1:2302': { w: 340 }, '1:2313': { w: 350, h: 140 } });
  const lessons = curriculum?.chapters.flatMap(ch => ch.lessons) || [];
  const replacements = textSlots(source, {
    '1:2299': `${course.lessonCount} ${course.lessonCount === 1 ? 'Lesson' : 'Lessons'}`,
    '1:2301': `${curriculum?.chapters.length || 0} ${(curriculum?.chapters.length || 0) === 1 ? 'Chapter' : 'Chapters'}`,
    '1:2302': course.title,
    '1:2313': description,
    ...Object.fromEntries(lessons.slice(0, 3).flatMap((item, index) => [
      [['1:2244', '1:2257', '1:2270'][index], `Lesson ${index + 1}`],
      [['1:2245', '1:2258', '1:2271'][index], item.title],
    ])),
  }, ['1:2302']);
  replacements['1:2272'] = <View style={{ width: 390 * scale, height: 220 * scale, overflow: 'hidden' }}>
    <Playback key={`${lesson.id}:${enrollment?.id || 'preview'}`} lesson={lesson} presentation="figma"
      enrollmentId={accessible ? enrollment?.id : undefined} onConfirmed={confirmed} />
  </View>;
  replacements['1:2303'] = <View style={{ flexDirection: 'row', gap: 8 * scale }}>
    <Avatar name={course.instructor.name} size={48} />
    {progress !== undefined && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}
      style={{ width: 48 * scale, height: 48 * scale, borderRadius: 24 * scale,
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#087E8B' }}>
      <Text style={{ color: 'white', fontFamily: 'Montserrat-Medium', fontSize: 11 * scale }}>{Math.round(progress)}%</Text>
    </View>}
  </View>;
  replacements['1:2313'] = <Text numberOfLines={7} style={{ fontFamily: 'Montserrat-Medium', fontSize: 14 * scale,
    lineHeight: 20 * scale, color: '#4A454B', includeFontPadding: false }}>{description}</Text>;
  const hidden = new Set<string>(['1:2281', '1:2286']);
  const groupIds = ['1:2233', '1:2246', '1:2259'];
  groupIds.slice(lessons.length).forEach(id => hidden.add(id));
  const actions: Record<string, { label: string; run: () => void; disabled?: boolean }> = {
    '1:2282': { label: 'Back to course', run: back },
  };
  lessons.slice(0, 3).forEach((item, index) => {
    actions[groupIds[index]] = { label: `Play ${item.title}`, run: () => select(item), disabled: item.id === lesson.id };
  });
  return <View testID={`screen-${SCREEN.player}`} style={{ height: 814 * scale, marginTop: -30 * scale }}>
    <Fragment source={source} replacements={replacements} hidden={hidden} actions={actions} />
  </View>;
}

function Profile({ user, go }: { user: SessionUser; go: (route: Route) => void }) {
  const result = useData<SessionUser>('/me');
  const scale = useDesignScale();
  const source = adapt(node(SCREEN.profile, '1:1850'), { '1:1851': { w: 230 }, '1:1852': { w: 230, h: 36 } });
  return <Data result={result}>{value => <View style={{ marginHorizontal: 20 * scale }}>
    <View style={{ height: 100 * scale, borderRadius: 30 * scale, backgroundColor: 'white' }}>
      <View style={{ position: 'absolute', left: 20 * scale, top: 17 * scale }}><Avatar name={value.name || user.name} size={66} /></View>
      <View style={{ position: 'absolute', left: 100 * scale, top: 28 * scale }}><Fragment source={source}
        replacements={textSlots(source, { '1:1851': value.name, '1:1852': value.email }, ['1:1851'])} /></View>
    </View>
    <View style={{ marginTop: 30 * scale }}><Fragment source={node(SCREEN.profile, '1:1853')} actions={{
      '1:1854': { label: 'Your current courses', run: () => go({ page: 'courses' }) },
      '1:1859': { label: 'Learning history', run: () => go({ page: 'history' }) },
      '1:1864': { label: 'Certificates', run: () => go({ page: 'certificates' }) },
      '1:1869': { label: 'Settings', run: () => go({ page: 'settings' }) },
    }} /></View>
  </View>}</Data>;
}

export function Action({
  title,
  run,
  disabled,
}: {
  title: string;
  run: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <>
      <Button
        title={busy ? 'Please wait…' : title}
        disabled={disabled || busy}
        onPress={async () => {
          if (pending.current) {
            return;
          }
          pending.current = true;
          setBusy(true);
          setError('');
          try {
            await run();
          } catch (e) {
            if (alive.current) {
              setError((e as Error).message);
            }
          } finally {
            pending.current = false;
            if (alive.current) {
              setBusy(false);
            }
          }
        }}
      />
      <ErrorBox message={error} />
    </>
  );
}
function AccountSettings({
  user,
  go,
  subscribe,
}: {
  user: SessionUser;
  go: (route: Route) => void;
  subscribe: () => void;
}) {
  const result = useData<SessionUser>('/me'),
    settings = useData<{
      learningNotifications: boolean;
      certificatePublic: boolean;
    }>('/me/settings');
  const subscriptions =
    useData<
      { id: string; status: string; periodEnd: string; accessActive: boolean }[]
    >('/me/subscriptions');
  const [edit, setEdit] = useState(false),
    [name, setName] = useState(user.name);
  return (
    <>
      <Data result={result}>
        {value => (
          <View style={ui.card}>
            <Text style={ui.title}>{value.name}</Text>
            <Text style={ui.note}>{value.email}</Text>
            {value.emailVerificationRequired !== false && <Text style={ui.note}>
              {value.emailVerified
                ? 'Email verified'
                : 'Verify your email to enroll and subscribe.'}
            </Text>}
            <Button
              title="Edit profile"
              onPress={() => {
                setName(value.name);
                setEdit(true);
              }}
            />
            {!value.emailVerified && value.emailVerificationRequired !== false && (
              <Action
                title="Resend verification email"
                run={async () => {
                  await api('/auth/email/verification-requests', 'POST', {
                    email: value.email,
                  });
                  Alert.alert(
                    'Email verification',
                    'Local mode: open the latest verification link in backendCSC/.local/mail on your computer. No external email is sent.',
                  );
                }}
              />
            )}
          </View>
        )}
      </Data>
      <View style={ui.row}>
        {(
          ['bookmarks', 'history', 'certificates', 'notifications'] as const
        ).map(page => (
          <Button
            secondary
            key={page}
            title={
              {
                bookmarks: 'Saved courses',
                history: 'Learning history',
                certificates: 'Certificates',
                notifications: 'Notifications',
              }[page]
            }
            onPress={() => go({ page })}
          />
        ))}
      </View>
      <Text style={ui.subtitle}>Your subscriptions</Text>
      <Data result={subscriptions}>
        {rows => (
          <>
            {!rows.length && <Text style={ui.note}>No subscriptions yet.</Text>}
            {rows.map(v => (
              <View key={v.id} style={ui.card}>
                <Text style={ui.note}>
                  {v.status} · Until {date(v.periodEnd)} ·{' '}
                  {v.accessActive ? 'Access active' : 'No active access'}
                </Text>
              </View>
            ))}
          </>
        )}
      </Data>
      <Button title="Subscription plans" onPress={subscribe} />
      <Text style={ui.subtitle}>Settings</Text>
      <Data result={settings}>
        {value => (
          <Settings
            key={JSON.stringify(value)}
            value={value}
            saved={settings.reload}
          />
        )}
      </Data>
      <Action title="Log out" run={() => signOut()} />
      {edit && (
        <Dialog
          title="Edit profile"
          onClose={() => setEdit(false)}
          saveLabel="Save"
          onSave={async () => {
            if (!name.trim()) {
              throw new Error('Enter your name.');
            }
            await api('/me', 'PATCH', { name: name.trim() });
            result.reload();
          }}
        >
          <Field label="Full name" value={name} onChange={setName} max={100} />
          <Text style={ui.note}>
            Email cannot be changed through the name field.
          </Text>
        </Dialog>
      )}
    </>
  );
}
function Settings({
  value,
  saved,
}: {
  value: { learningNotifications: boolean; certificatePublic: boolean };
  saved: () => void;
}) {
  const [form, setForm] = useState(value);
  return (
    <>
      <Toggle
        label="Learning notifications"
        value={form.learningNotifications}
        onChange={learningNotifications =>
          setForm({ ...form, learningNotifications })
        }
      />
      <Toggle
        label="Public certificate verification"
        value={form.certificatePublic}
        onChange={certificatePublic => setForm({ ...form, certificatePublic })}
      />
      <Action
        title="Save settings"
        run={async () => {
          await api('/me/settings', 'PATCH', form);
          saved();
        }}
      />
    </>
  );
}
function Certificates() {
  return (
    <Pager<Certificate>
      path="/me/certificates"
      render={c => (
        <View key={c.id} style={ui.card}>
          <Text style={ui.subtitle}>{c.courseTitle}</Text>
          <Text style={ui.note}>
            {c.learnerName} · {c.status} · {date(c.issuedAt)}
          </Text>
          <Action
            title="Download PDF"
            disabled={c.status !== 'issued'}
            run={async () => {
              const value = await api<{ url: string }>(
                `/me/certificates/${c.id}/download`,
              );
              await Linking.openURL(mediaUrl(value.url));
            }}
          />
        </View>
      )}
    />
  );
}
function Notifications({
  go,
  subscribe,
}: {
  go: (route: Route) => void;
  subscribe: () => void;
}) {
  const [revision, setRevision] = useState(0);
  return (
    <Pager<Notification>
      path="/me/notifications"
      revision={revision}
      render={n => (
        <View key={n.id} style={ui.card}>
          <Text style={ui.subtitle}>
            {n.readAt ? '' : '● '}
            {n.title}
          </Text>
          <Text style={ui.note}>{n.body}</Text>
          <Text style={ui.note}>{date(n.createdAt)}</Text>
          {!n.readAt && (
            <Action
              title="Mark as read"
              run={async () => {
                await api(`/me/notifications/${n.id}/read`, 'PUT');
                setRevision(v => v + 1);
              }}
            />
          )}
          {n.target && (
            <Action
              title="Open"
              run={async () => {
                if (n.target!.type === 'subscription') {
                  subscribe();
                } else if (n.target!.type === 'certificate') {
                  go({ page: 'certificates' });
                } else {
                  const value = await api<CourseDetail>(
                    `/courses/${n.target!.id}`,
                  );
                  go({ page: 'detail', course: value.course });
                }
              }}
            />
          )}
        </View>
      )}
    />
  );
}
