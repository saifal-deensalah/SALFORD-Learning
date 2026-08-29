import { useData } from '../services/useData';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Data } from '../components/NativeUI';
import { type SessionUser } from '../services/api';
import { SCREEN } from '../design/types';
import type { Course, Enrollment, LibraryItem } from './types';
import { adapt, Avatar, Categories, CourseCard, Fragment, node, SearchField, s, textSlots, useDesignScale } from './FigmaUI';

export function Home({ open, profile, notifications, search }: {
  open: (course: Course, enrollment?: Enrollment) => void; profile: () => void;
  notifications: () => void; search: (category?: string) => void;
}) {
  const result = useData<{ user: SessionUser; trending: Course[]; popular: Course[];
    categories?: { id: string; name: string }[]; continueLearning: LibraryItem[];
    unreadNotifications: number }>('/home');
  const scale = useDesignScale();
  return <Data result={result}>{value => {
    const categoryOrder = new Map([
      ['UI & UX', 0], ['Animation', 1], ['Graphic Design', 2],
      ['Programming', 3], ['Cybersecurity', 4],
    ]);
    const categories = [...(value.categories || Array.from(new Map(
      [...value.trending, ...value.popular].map(c => [c.category.id, c.category]),
    ).values()))].sort((a, b) =>
      (categoryOrder.get(a.name) ?? 99) - (categoryOrder.get(b.name) ?? 99));
    const greeting = adapt(node(SCREEN.home, '1:1089'), { '1:1090': { w: 245 } });
    const replacements = textSlots(greeting, { '1:1090': `Hello, ${value.user.name}` }, ['1:1090']);
    replacements['1:1099'] = <Avatar name={value.user.name} />;
    return <>
      <View style={{ marginLeft: 20 * scale, marginTop: 50 * scale }}>
        <Fragment source={greeting} replacements={replacements} actions={{
          '1:1099': { label: 'Your profile', run: profile },
          '1:1092': { label: `Notifications (${value.unreadNotifications})`, run: notifications },
        }} />
        <View style={{ marginTop: 45 * scale, height: 100 * scale }}>
          <Fragment source={node(SCREEN.home, '1:1072')} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 224 * scale, top: -5 * scale }}>
            <Fragment source={node(SCREEN.home, '1:1119')} />
          </View>
        </View>
        <View style={{ marginTop: 30 * scale }}><SearchField open={() => search()} filter={() => search()} /></View>
        <View style={{ marginTop: 25 * scale, width: 350 * scale, minHeight: 37 * scale }}>
          <Categories categories={categories} select={search} />
        </View>
      </View>
      {(['trending', 'popular'] as const).map((kind, index) => <View key={kind} style={{ marginTop: 40 * scale }}>
        <View style={{ marginLeft: 20 * scale }}><Fragment source={node(SCREEN.home, index ? '1:1160' : '1:1131')}
          actions={{ [index ? '1:1163' : '1:1137']: { label: `See all ${kind} courses`, run: () => search() } }} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 20 * scale }}
          contentContainerStyle={{ paddingHorizontal: 20 * scale, gap: 20 * scale }}>
          {value[kind].map(c => <CourseCard key={c.id} course={c} compact open={() => open(c)} />)}
          {!value[kind].length && <Text style={s.note}>No courses have been published yet.</Text>}
        </ScrollView>
      </View>)}
      {!!value.continueLearning.length && <View style={{ margin: 20 * scale }}>
        <Text style={[s.subtitle, { marginBottom: 20 * scale }]}>Continue learning</Text>
        {value.continueLearning.map(item => <CourseCard key={item.enrollment.id} course={item.course}
          progress={item.enrollment.progressPercent} open={() => open(item.course, item.enrollment)} />)}
      </View>}
    </>;
  }}</Data>;
}
