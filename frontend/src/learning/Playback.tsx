import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import { api, ApiError, mediaUrl, requestId } from '../services/api';
import { Button as NativeButton, ErrorBox, ui } from '../components/NativeUI';
import { Button as FigmaButton } from './FigmaUI';
import type { Lesson } from './types';

type Grant = {
  playbackSessionId: string;
  streamUrl: string;
  expiresAt: string;
  resumePositionSeconds: number;
  durationSeconds: number;
  heartbeatIntervalSeconds: number;
  progressAllowed: boolean;
};
export type PlaybackEvent = {
  eventId: string;
  sequence: number;
  kind: 'heartbeat' | 'seek' | 'pause' | 'ended';
  positionSeconds: number;
  playbackRate: number;
};
type Receipt = {
  acceptedEventIds: string[];
  nextSequence: number;
  enrollment: {
    id: string;
    progressPercent: number;
    completed: boolean;
  } | null;
};
// Serialized, replayable events prevent duplicate progress after a timeout.
export class PlaybackQueue {
  private sequence = 1;
  private pending: PlaybackEvent[] = [];
  private running = false;
  private stopped = false;
  constructor(
    private send: (event: PlaybackEvent) => Promise<Receipt>,
    private receipt: (value: Receipt) => void,
    private failed: (error: Error) => void,
  ) {}
  push(kind: PlaybackEvent['kind'], position: number, rate: number) {
    if (this.stopped || !Number.isFinite(position)) {
      return;
    }
    this.pending.push({
      eventId: requestId(),
      sequence: this.sequence++,
      kind,
      positionSeconds: Math.max(0, position),
      playbackRate: Math.min(2, Math.max(0.5, rate)),
    });
    void this.flush();
  }
  async flush() {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      while (this.pending.length && !this.stopped) {
        const event = this.pending[0],
          result = await this.send(event);
        if (
          !result.acceptedEventIds.includes(event.eventId) ||
          result.nextSequence !== event.sequence + 1
        ) {
          throw new Error('The server did not confirm this playback event.');
        }
        this.pending.shift();
        if (!this.stopped) {
          this.receipt(result);
        }
      }
    } catch (error) {
      if (!this.stopped) {
        this.failed(error as Error);
      }
    } finally {
      this.running = false;
    }
  }
  stop() {
    this.stopped = true;
    this.pending = [];
  }
}
export function Playback({
  lesson,
  enrollmentId,
  onConfirmed,
  presentation,
}: {
  lesson: Lesson;
  enrollmentId?: string;
  onConfirmed?: () => void;
  presentation?: 'figma';
}) {
  const Button = presentation === 'figma' ? FigmaButton : NativeButton;
  const [grant, setGrant] = useState<Grant>(),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [paused, setPaused] = useState(false),
    [ended, setEnded] = useState(false),
    [progress, setProgress] = useState<number>(),
    [expired, setExpired] = useState(false);
  const video = useRef<VideoRef>(null),
    position = useRef(0),
    rate = useRef(1),
    queue = useRef<PlaybackQueue | null>(null),
    lastSent = useRef(0),
    failed = useRef(false);
  useEffect(() => {
    let active = true;
    setGrant(undefined);
    setError('');
    setExpired(false);
    setPaused(false);
    setEnded(false);
    failed.current = false;
    api<Grant>(
      `/lessons/${lesson.id}/playback-sessions`,
      'POST',
      enrollmentId ? { enrollmentId } : {},
    )
      .then(value => {
        if (!active) {
          return;
        }
        position.current = value.resumePositionSeconds;
        lastSent.current = Date.now();
        setGrant(value);
        queue.current = new PlaybackQueue(
          event =>
            api<Receipt>(
              `/playback-sessions/${value.playbackSessionId}/events`,
              'POST',
              { events: [event] },
            ),
          result => {
            failed.current = false;
            setError('');
            if (result.enrollment) {
              setProgress(result.enrollment.progressPercent);
              onConfirmed?.();
            }
          },
          e => {
            failed.current = true;
            setPaused(true);
            setError(e.message);
            if (
              e instanceof ApiError &&
              e.code === 'PLAYBACK_SESSION_EXPIRED'
            ) {
              setExpired(true);
            }
          },
        );
      })
      .catch(e => {
        if (active) {
          setError(e.message);
        }
      });
    return () => {
      active = false;
      queue.current?.stop();
      queue.current = null;
    };
  }, [lesson.id, enrollmentId, attempt, onConfirmed]);
  useEffect(() => {
    if (!grant) {
      return;
    }
    const timer = setTimeout(() => {
      setPaused(true);
      setExpired(true);
    }, Math.max(0, new Date(grant.expiresAt).getTime() - Date.now() - 5000));
    return () => clearTimeout(timer);
  }, [grant]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        setPaused(true);
        if (!failed.current) {
          queue.current?.push('pause', position.current, rate.current);
        }
      }
    });
    return () => sub.remove();
  }, []);
  return (
    <View style={presentation === 'figma' ? s.figma : ui.card}>
      {presentation !== 'figma' && <Text style={ui.subtitle}>{lesson.title}</Text>}
      {grant && !expired && (
        <Video
          ref={video}
          source={{ uri: mediaUrl(grant.streamUrl) }}
          style={[s.video, presentation === 'figma' && s.figmaVideo]}
          controls
          paused={paused || !!error}
          resizeMode="contain"
          progressUpdateInterval={1000}
          onLoad={() => {
            if (grant.resumePositionSeconds >= grant.durationSeconds) {
              position.current = 0;
              queue.current?.push('seek', 0, rate.current);
              video.current?.seek(0);
            } else if (grant.resumePositionSeconds > 0) {
              video.current?.seek(grant.resumePositionSeconds);
            }
          }}
          onProgress={event => {
            position.current = event.currentTime;
            if (
              !failed.current &&
              Date.now() - lastSent.current >=
                grant.heartbeatIntervalSeconds * 1000
            ) {
              lastSent.current = Date.now();
              queue.current?.push('heartbeat', position.current, rate.current);
            }
          }}
          onSeek={event => {
            position.current = event.seekTime;
            setEnded(event.seekTime >= grant.durationSeconds);
            if (!failed.current) {
              queue.current?.push('seek', event.seekTime, rate.current);
            }
          }}
          onPlaybackRateChange={event => {
            if (event.playbackRate > 0) {
              rate.current = event.playbackRate;
            } else if (!failed.current) {
              queue.current?.push('pause', position.current, rate.current);
            }
          }}
          onEnd={() => {
            position.current = grant.durationSeconds;
            setEnded(true);
            if (!failed.current) {
              queue.current?.push('ended', position.current, rate.current);
            }
            setPaused(true);
          }}
          onError={() => {
            setPaused(true);
            setError(
              'The video could not be loaded. Check your connection and retry.',
            );
          }}
        />
      )}
      {!grant && !error && <ActivityIndicator accessibilityLabel="Loading lesson" color="white" style={StyleSheet.absoluteFill} />}
      {presentation !== 'figma' && <Text style={ui.note}>
        {grant?.progressAllowed
          ? `Server-confirmed course progress: ${
              progress === undefined ? '—' : `${progress}%`
            }`
          : 'Preview only. Enroll to save progress.'}
      </Text>}
      <ErrorBox
        message={error}
        retry={() => {
          if (failed.current && !expired) {
            void queue.current?.flush();
          } else {
            setAttempt(n => n + 1);
          }
        }}
      />
      {expired ? (
        <Button
          title="Continue lesson / تجديد جلسة التشغيل"
          onPress={() => setAttempt(n => n + 1)}
        />
      ) : (
        grant && presentation !== 'figma' && (
          <Button
            title={ended ? 'Replay' : paused ? 'Resume' : 'Pause'}
            disabled={!!error}
            onPress={() => {
              if (ended) {
                position.current = 0;
                queue.current?.push('seek', 0, rate.current);
                video.current?.seek(0);
                setEnded(false);
                setPaused(false);
                return;
              }
              setPaused(v => !v);
              if (!paused) {
                queue.current?.push('pause', position.current, rate.current);
              }
            }}
          />
        )
      )}
    </View>
  );
}
const s = StyleSheet.create({
  figma: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#0B3954', overflow: 'hidden' },
  figmaVideo: { borderRadius: 0 },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0B3954',
    borderRadius: 16,
  },
});
