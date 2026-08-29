import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { theme } from '../design/types';
export function LessonPlayer({
  scale,
  initialProgress,
  onProgress,
  onComplete,
}: {
  scale: number;
  initialProgress: number;
  onProgress: (percent: number) => void;
  onComplete: () => void;
}) {
  const ref = useRef<VideoRef>(null),
    last = useRef(-1);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  return (
    <View
      style={{
        width: 390 * scale,
        height: 220 * scale,
        backgroundColor: theme.navy,
      }}
    >
      <Video
        key={attempt}
        ref={ref}
        source={require('../assets/media/ui-ux-preview.mp4')}
        style={StyleSheet.absoluteFill}
        controls
        resizeMode="contain"
        playInBackground={false}
        playWhenInactive={false}
        onLoad={({ duration }) => {
          setLoading(false);
          if (initialProgress > 0 && initialProgress < 100) {
            ref.current?.seek((duration * initialProgress) / 100);
          }
        }}
        onProgress={({ currentTime, seekableDuration }) => {
          if (!seekableDuration) {
            return;
          }
          const p = Math.floor((currentTime / seekableDuration) * 100);
          if (p >= last.current + 5) {
            last.current = p;
            onProgress(p);
          }
        }}
        onEnd={onComplete}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
      {loading && (
        <ActivityIndicator
          accessibilityLabel="Loading lesson"
          color="white"
          style={StyleSheet.absoluteFill}
        />
      )}
      {error && (
        <Pressable
          style={styles.error}
          onPress={() => {
            setError(false);
            setLoading(true);
            setAttempt(a => a + 1);
          }}
        >
          <Text style={styles.text}>
            Could not play the demo lesson. Tap to retry.
          </Text>
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  error: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    padding: 25,
    backgroundColor: theme.navy,
  },
  text: { color: 'white', textAlign: 'center' },
});
