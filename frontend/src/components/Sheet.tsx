import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../design/types';
export function Sheet({
  title,
  visible,
  close,
  children,
}: {
  title: string;
  visible: boolean;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close panel"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close panel"
              onPress={close}
              style={styles.close}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export const sheetStyles = StyleSheet.create({
  text: {
    fontFamily: 'Montserrat-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: theme.muted,
    marginBottom: 16,
  },
  row: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowTitle: {
    color: theme.navy,
    fontFamily: 'Montserrat-Medium',
    fontSize: 15,
    flex: 1,
  },
  button: {
    backgroundColor: theme.teal,
    padding: 17,
    borderRadius: 28,
    alignItems: 'center',
    marginVertical: 10,
  },
  buttonText: { fontFamily: 'Montserrat-Medium', color: 'white', fontSize: 15 },
  input: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D4E2E4',
    padding: 14,
    color: theme.ink,
    fontFamily: 'Montserrat-Medium',
    marginBottom: 12,
  },
});
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '85%',
    minHeight: 250,
    paddingTop: 10,
  },
  handle: {
    height: 4,
    width: 44,
    borderRadius: 3,
    backgroundColor: '#D3CBCE',
    alignSelf: 'center',
    marginBottom: 18,
  },
  heading: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    alignItems: 'center',
    paddingBottom: 18,
  },
  title: { fontSize: 23, fontWeight: '700', color: theme.navy, flex: 1 },
  close: {
    backgroundColor: 'white',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 28, color: theme.navy },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
});
