import React from 'react';
import { Pressable, Share, Switch, Text, TextInput, View } from 'react-native';
import { Sheet, sheetStyles as ss } from '../components/Sheet';
import { SCREEN, theme, type ScreenId } from '../design/types';
import manifest from '../design/manifest.json';
import { courses } from '../data/courses';
import type { LearningState } from '../state/useLearningState';
import { defaultProfile, notice, type Panel } from '../app/screen-config';
import { styles } from '../app/styles';
import { api, signOut } from '../services/api';
import { Action } from '../learning/StudentApp';
type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
type Props = {
  panel: Panel;
  setPanel: Setter<Panel>;
  current: ScreenId;
  go: (id: ScreenId, replace?: boolean) => void;
  openCourse: (id: string, player?: boolean) => void;
  state: LearningState;
  setState: Setter<LearningState>;
  category: string;
  setCategory: Setter<string>;
  form: Record<string, string>;
  setForm: Setter<Record<string, string>>;
  profile: typeof defaultProfile;
  setProfile: Setter<typeof defaultProfile>;
  setMessage: Setter<string>;
};
const panelTitle: Record<Panel, string> = {
  '': '',
  filters: 'Find your next course',
  bookmarks: 'Saved courses',
  history: 'Learning history',
  certificates: 'Certificates earned',
  settings: 'Settings',
  notifications: 'Notifications',
  forgot: 'Reset password',
  profile: 'Your profile',
  gallery: 'Figma screens',
};

export function LearningPanels({
  panel,
  setPanel,
  current,
  go,
  openCourse,
  state,
  setState,
  category,
  setCategory,
  form,
  setForm,
  profile,
  setProfile,
  setMessage,
}: Props) {
  function renderCourseRow(id: string, complete = false) {
    const c = courses.find(v => v.id === id);
    return (
      <Pressable
        key={id}
        style={ss.row}
        onPress={() => {
          setPanel('');
          openCourse(id, true);
        }}
      >
        <View style={styles.grow}>
          <Text style={ss.rowTitle}>{c?.title || 'UI & UX Design Basic'}</Text>
          <Text style={styles.small}>
            {complete
              ? 'Demo completion certificate'
              : `${state.progress[id] || 0}% complete`}
          </Text>
        </View>
        {complete ? (
          <Pressable
            accessibilityLabel="Share demo certificate"
            onPress={() =>
              Share.share({
                message: `SALFORD demo certificate\n${
                  profile.name
                }\nCompleted: ${
                  c?.title || 'UI & UX Design Basic'
                }\nLocal demonstration; not an accredited certificate.`,
              })
            }
          >
            <Text style={styles.link}>Share</Text>
          </Pressable>
        ) : (
          <Text style={styles.link}>→</Text>
        )}
      </Pressable>
    );
  }
  return (
    <Sheet
      visible={!!panel}
      title={panelTitle[panel]}
      close={() => setPanel('')}
    >
      {panel === 'filters' && (
        <>
          {[
            'All',
            'UI & UX',
            'Animation',
            'Graphic Design',
            'Programming',
            'Cybersecurity',
          ].map(c => (
            <Pressable
              key={c}
              style={ss.row}
              onPress={() => {
                setCategory(c);
                if (current !== SCREEN.search) {
                  go(SCREEN.search);
                }
                setPanel('');
              }}
            >
              <Text style={ss.rowTitle}>{c}</Text>
              <Text style={styles.link}>{category === c ? '●' : '○'}</Text>
            </Pressable>
          ))}
        </>
      )}
      {panel === 'bookmarks' && (
        <>
          {state.bookmarks.length ? (
            state.bookmarks.map(id => renderCourseRow(id))
          ) : (
            <Text style={ss.text}>
              No saved courses yet. Tap a bookmark on a course to keep it here.
            </Text>
          )}
          <Pressable style={ss.button} onPress={() => go(SCREEN.search)}>
            <Text style={ss.buttonText}>Explore courses</Text>
          </Pressable>
        </>
      )}
      {panel === 'history' && (
        <>
          {state.history.length ? (
            state.history.map(id => renderCourseRow(id))
          ) : (
            <Text style={ss.text}>
              Start a lesson and your learning history will appear here.
            </Text>
          )}
        </>
      )}
      {panel === 'certificates' && (
        <>
          <Text style={ss.text}>
            Demo certificates are available after completing a sample lesson.
            They are not accredited qualifications.
          </Text>
          {Object.entries(state.progress)
            .filter(([, p]) => p === 100)
            .map(([id]) => renderCourseRow(id, true))}
          {!Object.values(state.progress).some(p => p === 100) && (
            <Text style={ss.text}>You have no completed lessons yet.</Text>
          )}
        </>
      )}
      {panel === 'settings' && (
        <>
          <View style={ss.row}>
            <Text style={ss.rowTitle}>Learning notifications</Text>
            <Switch
              accessibilityLabel="Learning notifications"
              value={state.notifications}
              onValueChange={notifications =>
                setState(s => ({ ...s, notifications }))
              }
              trackColor={{ true: theme.teal, false: '#CCC' }}
            />
          </View>
          <Pressable style={ss.row} onPress={() => go(SCREEN.plans)}>
            <Text style={ss.rowTitle}>Subscription</Text>
            <Text style={styles.link}>{state.plan || 'View plans'} →</Text>
          </Pressable>
          <Pressable style={ss.row} onPress={() => setPanel('profile')}>
            <Text style={ss.rowTitle}>Edit demo profile</Text>
            <Text style={styles.link}>→</Text>
          </Pressable>
          <Pressable
            style={ss.row}
            onPress={async () => {
              try {
                await signOut();
              } catch {
                notice('Signed out locally. The server could not be reached.');
              } finally {
                setForm({});
                setProfile(defaultProfile);
                setState(s => ({ ...s, plan: null }));
                go(SCREEN.login, true);
              }
            }}
          >
            <Text style={[ss.rowTitle, { color: theme.danger }]}>Log out</Text>
          </Pressable>
          <Text style={ss.text}>
            SALFORD · Demo payments only{'\n'}Account login and demo payments
            use the server. Course previews, progress and bookmarks are local to
            this device.
          </Text>
        </>
      )}
      {panel === 'notifications' && (
        <Text style={ss.text}>
          {!state.notifications
            ? 'Learning notifications are turned off in Settings.'
            : state.plan
            ? `Your ${state.plan} demo plan is active. Continue your learning journey.`
            : 'Welcome to SALFORD. Explore your courses and start a sample lesson.'}
        </Text>
      )}
      {panel === 'forgot' && (
        <>
          <Text style={ss.text}>
            Enter your email to request a password reset link.
          </Text>
          <TextInput
            accessibilityLabel="Recovery email"
            placeholder="Email address"
            value={form.recovery || ''}
            onChangeText={v => setForm(f => ({ ...f, recovery: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
            style={ss.input}
          />
          <Action
            title="Request reset"
            run={async () => {
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recovery || '')) {
                throw new Error('Enter a valid email address.');
              }
              await api('/auth/password/reset-requests', 'POST', {
                email: form.recovery.trim(),
              });
              notice(
                'If this email has an account, a reset message was prepared. Local mode: open the latest link in backendCSC/.local/mail on your computer. No external email is sent.',
              );
            }}
          />
        </>
      )}
      {panel === 'profile' && (
        <>
          <Text style={ss.text}>
            Edit your local demo profile for this session.
          </Text>
          <TextInput
            accessibilityLabel="Full name"
            style={ss.input}
            value={profile.name}
            onChangeText={name => setProfile(p => ({ ...p, name }))}
          />
          <TextInput
            accessibilityLabel="Profile email"
            style={ss.input}
            value={profile.email}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={email => setProfile(p => ({ ...p, email }))}
          />
          <Pressable
            style={ss.button}
            onPress={() => {
              if (!profile.name.trim()) {
                notice('Enter your name.');
                return;
              }
              setPanel('');
              setMessage('Demo profile updated');
            }}
          >
            <Text style={ss.buttonText}>Done</Text>
          </Pressable>
        </>
      )}
      {panel === 'gallery' && (
        <>
          <Text style={ss.text}>
            Development screen gallery · 18 original Figma frames
          </Text>
          {manifest.map(f => (
            <Pressable
              style={ss.row}
              key={f.id}
              onPress={() => go(f.id as ScreenId, true)}
            >
              <Text style={ss.rowTitle}>{f.name}</Text>
              <Text style={styles.small}>{f.id}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Sheet>
  );
}
