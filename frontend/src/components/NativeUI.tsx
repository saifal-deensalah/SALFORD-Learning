import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '../services/useData';
export { useData } from '../services/useData';
import { theme } from '../design/types';

export const money = (amount: number, currency = 'USD') =>
  `${currency} ${(amount / 100).toFixed(2)}`;
export const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';
export function Button({
  title,
  onPress,
  disabled,
  secondary = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[ui.button, secondary && ui.secondary, disabled && ui.disabled]}
    >
      <Text style={[ui.buttonText, secondary && ui.secondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return message ? (
    <View style={ui.errorBox}>
      <Text accessibilityRole="alert" style={ui.error}>
        {message}
      </Text>
      {retry && (
        <Button title="Retry / إعادة المحاولة" onPress={retry} secondary />
      )}
    </View>
  ) : null;
}
export function Data<T>({
  result,
  children,
}: {
  result: ReturnType<typeof useData<T>>;
  children: (value: T) => React.ReactNode;
}) {
  return (
    <>
      {result.loading && <ActivityIndicator color={theme.teal} size="large" />}
      <ErrorBox message={result.error} retry={result.reload} />
      {result.data !== undefined && children(result.data)}
    </>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline,
  numeric,
  secure,
  max = 200,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  numeric?: boolean;
  secure?: boolean;
  max?: number;
}) {
  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        maxLength={max}
        style={[ui.input, multiline && ui.multiline]}
      />
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={ui.row}>
      <Text style={ui.flexText}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.teal }}
      />
    </View>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text style={ui.label}>{label}</Text>
      <Button
        secondary
        title={options.find(o => o.id === value)?.name || 'اختر…'}
        onPress={() => setOpen(true)}
      />
      {open && (
        <Dialog title={label} onClose={() => setOpen(false)}>
          {options.map(option => (
            <Button
              key={option.id}
              secondary
              title={`${option.id === value ? '✓ ' : ''}${option.name}`}
              onPress={() => {
                onChange(option.id);
                setOpen(false);
              }}
            />
          ))}
          {!options.length && (
            <Text style={ui.note}>لا توجد خيارات متاحة.</Text>
          )}
        </Dialog>
      )}
    </>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  onSave,
  saveLabel = 'حفظ',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave?: () => Promise<void>;
  saveLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const save = async () => {
    if (!onSave || pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave();
      if (mounted.current) {
        onClose();
      }
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
      }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  };
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        if (!pending.current) {
          onClose();
        }
      }}
    >
      <SafeAreaView style={ui.fill}>
        <KeyboardAvoidingView
          style={ui.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={ui.header}>
            <Text style={ui.title}>{title}</Text>
            <Button
              secondary
              title="إغلاق / Close"
              disabled={busy}
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ui.content}
          >
            {children}
            <ErrorBox message={error} />
            {onSave && (
              <Button
                title={busy ? 'جاري الحفظ…' : saveLabel}
                disabled={busy}
                onPress={() => {
                  void save();
                }}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export type Page<T> = { items: T[]; nextCursor: string | null };
export function Pager<T>({
  path,
  revision = 0,
  render,
}: {
  path: string;
  revision?: number;
  render: (item: T, index: number) => React.ReactNode;
}) {
  // Remount the cursor state whenever a filter changes; cursors are query-bound.
  return <Pages<T> key={`${path}:${revision}`} path={path} render={render} />;
}
function Pages<T>({
  path,
  render,
}: {
  path: string;
  render: (item: T, index: number) => React.ReactNode;
}) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const result = useData<Page<T>>(
    `${path}${path.includes('?') ? '&' : '?'}limit=20${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
    }`,
  );
  return (
    <Data result={result}>
      {page => (
        <>
          {page.items.map(render)}
          {!page.items.length && (
            <Text style={ui.note}>لا توجد نتائج / No results</Text>
          )}
          <View style={ui.row}>
            {!!cursors.length && (
              <Button
                secondary
                title="السابق / Previous"
                onPress={() => setCursors(c => c.slice(0, -1))}
              />
            )}
            {page.nextCursor && (
              <Button
                title="التالي / Next"
                onPress={() => setCursors(c => [...c, page.nextCursor!])}
              />
            )}
          </View>
        </>
      )}
    </Data>
  );
}
export const ui = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F7FAFB' },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  header: {
    padding: 18,
    gap: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderColor: '#E2EAEC',
  },
  title: { color: theme.navy, fontSize: 24, fontWeight: '700' },
  subtitle: { color: theme.navy, fontSize: 18, fontWeight: '600' },
  note: { color: '#5B6978', fontSize: 14, lineHeight: 22 },
  card: {
    backgroundColor: 'white',
    borderRadius: 22,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2EAEC',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  flexText: { flex: 1, color: theme.navy, fontSize: 15 },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: theme.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondary: { backgroundColor: '#EAF3F4' },
  secondaryText: { color: theme.teal },
  disabled: { opacity: 0.45 },
  field: { gap: 8 },
  label: { color: theme.navy, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#CFDADD',
    color: theme.navy,
    backgroundColor: 'white',
    borderRadius: 14,
    minHeight: 50,
    padding: 14,
    fontSize: 15,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  errorBox: {
    gap: 8,
    padding: 12,
    backgroundColor: '#FFF1F0',
    borderRadius: 12,
  },
  error: { color: '#A52B29', lineHeight: 22 },
});
