import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DesignScene, type Action } from '../components/DesignScene';
import { findNode, screens } from '../app/screen-config';
import { SCREEN, theme, type DesignNode, type ScreenId } from '../design/types';
import { api, mediaUrl } from '../services/api';
import { ErrorBox } from '../components/NativeUI';
import type { Course } from './types';

const Scale = createContext(1);
const ScrollTop = createContext<() => void>(() => {});
export const useDesignScale = () => useContext(Scale);
export const useScrollTop = () => useContext(ScrollTop);
export const node = (screen: ScreenId, id: string): DesignNode => {
  const value = findNode(screens[screen], id);
  if (!value) { throw new Error(`Missing Figma node ${screen}/${id}`); }
  return value;
};

// The exported scene remains immutable. Only data-bound text and its available
// width change; icons, fills, radii and local coordinates come from canvas.fig.
export function adapt(source: DesignNode, changes: Record<string, Partial<DesignNode>>): DesignNode {
  return { ...source, ...changes[source.id], children: source.children?.map(c => adapt(c, changes)) };
}
export function DesignText({ value, source, bold = false }: { value: string; source: DesignNode; bold?: boolean }) {
  const scale = useDesignScale();
  return <Text numberOfLines={2} style={{ fontFamily: 'Montserrat-Medium', fontWeight: bold ? '700' : '500',
    fontSize: (source.fontSize || 14) * scale, color: source.color || theme.ink, includeFontPadding: false }}>{value}</Text>;
}
export function textSlots(source: DesignNode, values: Record<string, string>, bold: string[] = []) {
  return Object.fromEntries(Object.entries(values).map(([id, value]) => [id,
    <DesignText key={id} value={value} source={findNode(source, id)!} bold={bold.includes(id)} />,
  ]));
}
export function Fragment({ source, replacements, actions, hidden }: {
  source: DesignNode; replacements?: Record<string, React.ReactNode>;
  actions?: Record<string, Action>; hidden?: Set<string>;
}) {
  const scale = useDesignScale();
  return <View style={{ width: source.w * scale, height: source.h * scale }}>
    <DesignScene node={source} root scale={scale} replacements={replacements} actions={actions} hidden={hidden} />
  </View>;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const scale = useDesignScale();
  return <View style={{ width: size * scale, height: size * scale, borderRadius: size * scale / 2,
    backgroundColor: theme.navy, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: 'white', fontFamily: 'Montserrat-Medium', fontSize: size * scale / 3 }}>
      {name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
    </Text>
  </View>;
}

export function StudentLayout({ children, screen, navigation, onNavigation, closeNavigation, refresh }: {
  children: React.ReactNode; screen: string; navigation: boolean;
  onNavigation: (page: 'home' | 'courses' | 'bookmarks' | 'profile' | 'settings') => void;
  closeNavigation: () => void; refresh: () => void;
}) {
  const width = Math.min(useWindowDimensions().width, 600), scale = width / 390;
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const scrollToTop = useCallback(() => scroll.current?.scrollTo({ y: 0, animated: false }), []);
  const floating = node(SCREEN.home, '1:1185');
  const menu = node(SCREEN.navigation, '1:2418');
  const actions: Record<string, Action> = {};
  for (const [id, label, page] of [
    ['1:2424', 'Saved courses', 'bookmarks'], ['1:2429', 'Profile', 'profile'],
    ['1:2438', 'My courses', 'courses'], ['1:2442', 'Settings', 'settings'],
    ['1:2437', 'Home', 'home'], ['1:2447', 'Home', 'home'],
  ] as const) { actions[id] = { label, run: () => onNavigation(page) }; }
  actions['1:2420'] = { label: 'Close navigation', run: closeNavigation };
  return <Scale.Provider value={scale}><ScrollTop.Provider value={scrollToTop}>
    <SafeAreaView style={s.fill} testID="student-app">
      <StatusBar barStyle="dark-content" />
      <View style={{ width, flex: 1, alignSelf: 'center', overflow: 'hidden' }}>
        <ScrollView ref={scroll} testID={`screen-${screen}`} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={theme.teal} />}
          contentContainerStyle={{ paddingBottom: 155 * scale, minHeight: '100%' }}>
          {children}
        </ScrollView>
        <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 30 * scale,
          left: (navigation ? 68 : 159) * scale, width: (navigation ? 254 : 72) * scale,
          height: (navigation ? 190 : 72) * scale }}>
          <Fragment source={navigation ? menu : floating} actions={navigation ? actions : {
            [floating.id]: { label: 'Open navigation', run: closeNavigation },
          }} />
        </View>
      </View>
    </SafeAreaView>
  </ScrollTop.Provider></Scale.Provider>;
}

export function Button({ title, onPress, secondary = false, disabled, testID }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; testID?: string;
}) {
  const scale = useDesignScale();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 50 * scale, borderRadius: 30 * scale,
      paddingVertical: 14 * scale, paddingHorizontal: 20 * scale, alignItems: 'center', justifyContent: 'center',
      backgroundColor: secondary ? 'white' : theme.navy, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
    <Text style={{ fontFamily: 'Montserrat-Medium', fontSize: 14 * scale, color: secondary ? theme.teal : 'white', textAlign: 'center' }}>{title}</Text>
  </Pressable>;
}

export function Header({ title, back, notifications }: { title: string; back: () => void; notifications: () => void }) {
  const scale = useDesignScale();
  const source = adapt(node(SCREEN.details, '1:1372'), { '1:1377': { x: 45, w: 260 } });
  return <View style={{ marginTop: 30 * scale, marginHorizontal: 20 * scale, marginBottom: 45 * scale }}>
    <Fragment source={source} replacements={{ '1:1377': <Text numberOfLines={1} style={[s.text, { textAlign: 'center', fontSize: 18 * scale }]}>{title}</Text> }}
      actions={{ '1:1373': { label: 'Back', run: back }, '1:1378': { label: 'Notifications', run: notifications } }} />
  </View>;
}

export function SearchField({ value, onChange, open, filter }: {
  value?: string; onChange?: (value: string) => void; open?: () => void; filter: () => void;
}) {
  const scale = useDesignScale();
  const source = node(SCREEN.home, '1:1100');
  return <View style={{ width: 350 * scale, height: 50 * scale }}>
    <Fragment source={source} hidden={onChange ? new Set(['1:1107']) : undefined}
      actions={open ? { [source.id]: { label: 'Search courses', run: open } } : undefined} />
    {onChange && <TextInput testID="course-search" accessibilityLabel="Search course or instructor" value={value}
      onChangeText={onChange} placeholder="Search Course" placeholderTextColor={theme.muted} maxLength={100}
      autoCapitalize="none" autoCorrect={false} style={{ position: 'absolute', left: 48 * scale, width: 240 * scale,
        height: 50 * scale, padding: 0, fontSize: 14 * scale, fontFamily: 'Montserrat-Medium', color: theme.ink }} />}
    <View style={{ position: 'absolute', left: 302 * scale, top: 2 * scale }}>
      <Fragment source={node(SCREEN.home, '1:1108')} actions={{ '1:1108': { label: 'Filter courses', run: filter } }} />
    </View>
  </View>;
}

export function Categories({ categories, selected, select }: {
  categories: { id: string; name: string }[]; selected?: string; select: (id: string) => void;
}) {
  const scale = useDesignScale();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 * scale }}>
    {categories.map((c, index) => <Pressable key={c.id || c.name} accessibilityRole="button" accessibilityLabel={`${c.name} courses`}
      accessibilityState={{ selected: selected === undefined ? index === 0 : selected === c.id }} onPress={() => select(c.id)}
      style={{ height: 37 * scale, borderRadius: 30 * scale, paddingHorizontal: 15 * scale, justifyContent: 'center',
        backgroundColor: (selected === undefined ? index === 0 : selected === c.id) ? theme.navy : 'white' }}>
      <Text style={{ fontFamily: 'Montserrat-Medium', fontSize: 14 * scale,
        color: (selected === undefined ? index === 0 : selected === c.id) ? 'white' : theme.navy }}>{c.name}</Text>
    </Pressable>)}
  </ScrollView>;
}

function Cover({ course, radius = 30 }: { course: Course; radius?: number }) {
  const scale = useDesignScale();
  const [failed, setFailed] = useState(false);
  return course.coverUrl && !failed ? <Image source={{ uri: mediaUrl(course.coverUrl) }} resizeMode="cover"
    onError={() => setFailed(true)} style={{ width: '100%', height: '100%', borderRadius: radius * scale }} /> :
    <View style={{ width: '100%', height: '100%', borderRadius: radius * scale, backgroundColor: '#CFE7E8',
      alignItems: 'center', justifyContent: 'center' }}><Text style={s.note}>Course image unavailable</Text></View>;
}

export function CourseCard({ course, open, compact = false, progress }: {
  course: Course; open: () => void; compact?: boolean; progress?: number;
}) {
  const [saved, setSaved] = useState(course.saved), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const scale = useDesignScale();
  if (progress !== undefined) {
    const source = adapt(node(SCREEN.courses, '1:1579'), {
      '1:1607': { w: 40 }, '1:1608': { x: 46 }, '1:1611': { x: -25, w: 61 },
      '1:1585': { w: 180 },
    });
    const replacements = textSlots(source, {
      '1:1584': course.title, '1:1585': `By: ${course.instructor.name}`, '1:1594': `${course.lessonCount} lessons`,
      '1:1596': `${Math.ceil(course.durationSeconds / 60)} min`, '1:1607': `${Math.round(progress)}%`,
      '1:1611': course.canAccess ? '' : 'Locked',
    }, ['1:1584', '1:1607']);
    replacements['1:1597'] = <Cover course={course} radius={20} />;
    replacements['1:1612'] = <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}
      style={{ width: 310 * scale, height: 12 * scale, borderRadius: 64 * scale, backgroundColor: '#E0E0E0', overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, progress))}%`, height: '100%', backgroundColor: theme.navy, borderRadius: 64 * scale }} />
    </View>;
    return <View style={{ marginBottom: 15 * scale }}><Fragment source={source} replacements={replacements}
      hidden={new Set(['1:1610'])} actions={{ [source.id]: { label: `Continue ${course.title}`, run: open } }} /></View>;
  }
  const ids = compact ? ['1:1140', '1:1141', '3002:236', '1:1143', '1:1145'] : ['1:1218', '1:1219', '1:1220', '1:1221', '1:1223'];
  const source = adapt(node(compact ? SCREEN.home : SCREEN.search, compact ? '1:1139' : '1:1217'), {
    [ids[0]]: { w: compact ? 202 : 350, h: 44 }, [ids[1]]: { w: compact ? 202 : 350, y: 258, h: 30 },
    [ids[3]]: { w: course.accessType === 'free' ? 63 : 120 },
  });
  const replacements = textSlots(source, { [ids[0]]: course.title, [ids[1]]: `By: ${course.instructor.name}` }, [ids[0]]);
  replacements[ids[2]] = <Cover course={course} />;
  replacements[ids[3]] = <Text style={{ fontFamily: 'Montserrat-Medium', fontWeight: '700', textAlign: 'center',
    fontSize: 12 * scale, paddingTop: 8 * scale, color: theme.ink }}>{course.accessType === 'free' ? 'Free' : 'Subscription'}</Text>;
  if (saved) { replacements[ids[4]] = <View style={{ backgroundColor: theme.teal, borderRadius: 20 * scale, width: 40 * scale,
    height: 40 * scale, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: 'white', fontSize: 22 * scale }}>✓</Text></View>; }
  const save = async () => {
    if (busy) { return; } setBusy(true); setError('');
    try { await api(`/me/bookmarks/${course.id}`, saved ? 'DELETE' : 'PUT'); setSaved(!saved); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const actions = { [source.id]: { label: `View course: ${course.title}`, run: open },
    [ids[4]]: { label: `${saved ? 'Remove bookmark' : 'Save'} ${course.title}`, run: () => { void save(); }, disabled: busy } };
  return <View style={{ width: source.w * scale, marginBottom: compact ? 0 : 20 * scale }}>
    <Fragment source={{ ...source, h: 290 }} replacements={replacements} actions={actions} />
    <ErrorBox message={error} retry={() => { void save(); }} />
  </View>;
}

export function CurriculumCard({ title, lessons, duration, status, open, disabled }: {
  title: string; lessons: string; duration: string; status: string; open: () => void; disabled?: boolean;
}) {
  const scale = useDesignScale();
  const source = adapt(node(SCREEN.details, '1:1399'), { '1:1403': { w: 275 }, '1:1415': { w: 105 }, '1:1416': { x: 225, w: 85 } });
  return <View style={{ marginBottom: 15 * scale }}><Fragment source={source}
    replacements={textSlots(source, { '1:1403': title, '1:1413': lessons, '1:1415': status, '1:1416': duration }, ['1:1403'])}
    actions={{ [source.id]: { label: `${title} · ${lessons} · ${duration}${status ? ` · ${status}` : ''}`, run: open, disabled } }} /></View>;
}

export const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.background },
  text: { color: theme.ink, fontFamily: 'Montserrat-Medium', includeFontPadding: false },
  title: { color: theme.ink, fontSize: 24, fontFamily: 'Montserrat-Medium', fontWeight: '700' },
  subtitle: { color: theme.ink, fontSize: 18, fontFamily: 'Montserrat-Medium', fontWeight: '700' },
  note: { color: '#66616A', fontSize: 14, lineHeight: 22, fontFamily: 'Montserrat-Medium' },
  card: { backgroundColor: 'white', borderRadius: 30, padding: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  content: { marginHorizontal: 20, gap: 15 },
});
