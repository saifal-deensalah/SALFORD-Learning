import React, { memo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { images } from '../assets/images';
import { DesignNode, theme } from '../design/types';

export type Action = { label: string; run: () => void; disabled?: boolean };
export interface SceneProps {
  node: DesignNode;
  scale: number;
  actions?: Record<string, Action>;
  hidden?: Set<string>;
  replacements?: Record<string, React.ReactNode>;
  selected?: Set<string>;
  root?: boolean;
}

/** Native layout, native touch targets and locally extracted vector artwork.
 * Text outlines preserve the source's mixed font runs and kerning. Their
 * actual text is exposed to VoiceOver/TalkBack; editable text uses TextInput.
 */
export const DesignScene = memo(function DesignScene({
  node: n,
  scale: s,
  actions,
  hidden,
  replacements,
  selected,
  root = false,
}: SceneProps) {
  if (hidden?.has(n.id)) {
    return null;
  }
  const action = actions?.[n.id];
  const replacement = replacements?.[n.id];
  const matrix = n.matrix;
  const style: ViewStyle = {
    position: 'absolute',
    left: (root ? 0 : n.x) * s,
    top: (root ? 0 : n.y) * s,
    width: n.w * s,
    height: n.h * s,
    opacity: n.opacity,
    backgroundColor: n.background,
    borderRadius: (n.radius || 0) * s,
    overflow: n.clip && !root ? 'hidden' : 'visible',
    ...(matrix
      ? {
          transformOrigin: 'top left',
          transform: [
            {
              matrix: [
                matrix[0],
                matrix[1],
                0,
                0,
                matrix[2],
                matrix[3],
                0,
                0,
                0,
                0,
                1,
                0,
                0,
                0,
                0,
                1,
              ],
            },
          ],
        }
      : {}),
  };
  const content =
    replacement !== undefined ? (
      replacement
    ) : (
      <>
        {n.svg ? (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              left: -2 * s,
              top: -2 * s,
              width: (n.w + 4) * s,
              height: (n.h + 4) * s,
            }}
          >
            <SvgXml xml={n.svg} width={(n.w + 4) * s} height={(n.h + 4) * s} />
          </View>
        ) : null}
        {n.image ? (
          <Image
            source={images[n.image]}
            resizeMode="cover"
            accessible={false}
            style={[
              StyleSheet.absoluteFill,
              {
                width: n.w * s,
                height: n.h * s,
                borderRadius: (n.radius || 0) * s,
              },
            ]}
          />
        ) : null}
        {n.children?.map(child => (
          <DesignScene
            key={child.id}
            node={child}
            scale={s}
            actions={actions}
            hidden={hidden}
            replacements={replacements}
            selected={selected}
          />
        ))}
      </>
    );
  const selection = selected?.has(n.id) ? (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderWidth: 2,
          borderColor: theme.teal,
          borderRadius: (n.radius || 20) * s,
        },
      ]}
    />
  ) : null;
  if (n.horizontal) {
    return (
      <ScrollView
        horizontal
        testID={`carousel-${n.id}`}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={[style, { width: 350 * s }]}
        contentContainerStyle={{ width: n.w * s, height: n.h * s }}
      >
        {content}
      </ScrollView>
    );
  }
  if (action) {
    return (
      <Pressable
        testID={`node-${n.id}`}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityState={{ selected: selected?.has(n.id), disabled: !!action.disabled }}
        disabled={action.disabled}
        onPress={action.disabled ? undefined : event => {
          event.stopPropagation();
          action.run();
        }}
        hitSlop={n.w < 44 || n.h < 30 ? 8 : 0}
        style={({ pressed }) => [style, action.disabled && { opacity: 0.45 }, pressed && { opacity: 0.72 }]}
      >
        {content}
        {selection}
      </Pressable>
    );
  }
  return (
    <View
      style={style}
      accessible={!!n.text && replacement === undefined}
      accessibilityLabel={replacement === undefined ? n.text : undefined}
      pointerEvents={
        n.text || (n.svg && !n.children?.length) ? 'none' : 'box-none'
      }
    >
      {content}
      {selection}
    </View>
  );
});

export function DynamicText({
  text,
  node,
  scale,
}: {
  text: string;
  node: DesignNode;
  scale: number;
}) {
  return (
    <Text
      numberOfLines={2}
      style={{
        fontFamily: 'Montserrat-Medium',
        fontSize: (node.fontSize || 14) * scale,
        color: node.color || theme.ink,
        includeFontPadding: false,
      }}
    >
      {text}
    </Text>
  );
}
