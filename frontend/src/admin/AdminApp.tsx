import React, { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  Data,
  Dialog,
  Field,
  money,
  ui,
  useData,
} from '../components/NativeUI';
import { setAdminKey, signOut, type SessionUser } from '../services/api';
import { Courses } from './Courses';
import { Activity, Catalog, Payments, Plans, Users } from './Management';
import type { Overview } from './types';

const tabs = [
  'الرئيسية',
  'الدورات',
  'الطلاب',
  'الخطط',
  'سجل الدفع',
  'المحتوى والملفات',
  'سجل النشاط',
] as const;
export function AdminApp({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState(0),
    [revision, setRevision] = useState(0),
    [settings, setSettings] = useState(false),
    [key, setKey] = useState('');
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab) {
        setTab(0);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tab]);
  return (
    <SafeAreaView style={ui.fill} testID="mobile-admin">
      <StatusBar barStyle="dark-content" />
      <View style={ui.header}>
        <Text style={ui.title}>SALFORD · الإدارة</Text>
        <Text style={ui.note}>مرحبًا {user.name}</Text>
        <View style={ui.row}>
          <Button
            secondary
            title="إعدادات الاتصال"
            onPress={() => setSettings(true)}
          />
          <Button
            secondary
            title="تسجيل الخروج"
            onPress={() =>
              Alert.alert('تسجيل الخروج', 'هل تريد إنهاء جلسة الإدارة؟', [
                { text: 'إلغاء', style: 'cancel' },
                {
                  text: 'خروج',
                  onPress: () => {
                    void signOut().catch(() =>
                      Alert.alert(
                        'تم الخروج محليًا',
                        'تعذر الوصول للسيرفر لإلغاء الجلسة.',
                      ),
                    );
                  },
                },
              ])
            }
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {tabs.map((title, i) => (
            <Button
              key={title}
              title={title}
              secondary={i !== tab}
              onPress={() => setTab(i)}
            />
          ))}
        </ScrollView>
      </View>
      <ScrollView
        key={`${tab}:${revision}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={ui.content}
      >
        <Button
          secondary
          title="تحديث"
          onPress={() => setRevision(n => n + 1)}
        />
        {tab === 0 ? (
          <OverviewPage />
        ) : tab === 1 ? (
          <Courses />
        ) : tab === 2 ? (
          <Users />
        ) : tab === 3 ? (
          <Plans />
        ) : tab === 4 ? (
          <Payments />
        ) : tab === 5 ? (
          <Catalog />
        ) : (
          <Activity />
        )}
      </ScrollView>
      {settings && (
        <Dialog
          title="إعدادات اتصال الإدارة"
          onClose={() => {
            setSettings(false);
            setKey('');
          }}
          onSave={async () => {
            setAdminKey(key);
            setRevision(n => n + 1);
          }}
        >
          <Text style={ui.note}>
            للإنتاج فقط: مفتاح بوابة الإدارة إن طلبه السيرفر. يُحفظ في الذاكرة
            ويُمسح عند الخروج. لا يعطي هذا المفتاح صلاحية أدمن لحساب طالب.
          </Text>
          <Field
            label="Admin gateway key"
            value={key}
            onChange={setKey}
            secure
            max={512}
          />
        </Dialog>
      )}
    </SafeAreaView>
  );
}
function OverviewPage() {
  const result = useData<Overview>('/admin/overview');
  return (
    <Data result={result}>
      {v => (
        <>
          <Text style={ui.title}>نظرة عامة</Text>
          {[
            ['الطلاب', v.students],
            ['الدورات المنشورة', `${v.published} / ${v.courses}`],
            ['التسجيلات', v.enrollments],
            ['الإكمالات', v.completions],
            ['عمليات وهمية فعالة', v.activeDemoPayments],
            [
              'إجمالي وهمي (لا توجد أموال حقيقية)',
              money(v.demoAmountMinor, v.currency),
            ],
          ].map(([title, value]) => (
            <View key={String(title)} style={ui.card}>
              <Text style={ui.note}>{title}</Text>
              <Text style={ui.title}>{value}</Text>
            </View>
          ))}
          <Text style={ui.subtitle}>تسجيلات آخر 7 أيام</Text>
          {v.activity.map(a => (
            <View key={a.day} style={ui.row}>
              <Text style={ui.flexText}>{a.day}</Text>
              <Text style={ui.subtitle}>{a.enrollments}</Text>
            </View>
          ))}
          <Text style={ui.subtitle}>آخر الدورات</Text>
          {v.recentCourses.map(c => (
            <View key={c.id} style={ui.card}>
              <Text style={ui.subtitle}>{c.title}</Text>
              <Text style={ui.note}>{c.status}</Text>
            </View>
          ))}
        </>
      )}
    </Data>
  );
}
