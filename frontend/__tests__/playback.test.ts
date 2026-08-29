import { PlaybackQueue, type PlaybackEvent } from '../src/learning/Playback';
import {
  testPaymentDetails,
  validateDemoPayment,
} from '../src/components/DemoCheckout';

test('payment accepts only documented test fields and rejects expired dates', () => {
  expect(validateDemoPayment(testPaymentDetails())).toBe('');
  expect(
    validateDemoPayment({ ...testPaymentDetails(), card: '4111111111111111' }),
  ).toContain('test card');
  expect(
    validateDemoPayment({ ...testPaymentDetails(), expiry: '01/20' }),
  ).toContain('future expiry');
  expect(
    validateDemoPayment({ ...testPaymentDetails(), cvv: '999' }),
  ).toContain('123');
});
test('playback retries preserve event identity and seeking never becomes completion locally', async () => {
  const received: PlaybackEvent[] = [],
    receipt = jest.fn(),
    failed = jest.fn();
  let fail = true;
  const queue = new PlaybackQueue(
    async event => {
      received.push(event);
      if (fail) {
        throw new Error('timeout');
      }
      return {
        acceptedEventIds: [event.eventId],
        nextSequence: event.sequence + 1,
        enrollment: { id: 'enrollment', progressPercent: 0, completed: false },
      };
    },
    receipt,
    failed,
  );
  queue.push('seek', 500, 1);
  await Promise.resolve();
  await Promise.resolve();
  expect(failed).toHaveBeenCalled();
  expect(receipt).not.toHaveBeenCalled();
  fail = false;
  await queue.flush();
  expect(received[0]).toEqual(received[1]);
  expect(received[1].kind).toBe('seek');
  expect(receipt.mock.calls[0][0].enrollment).toMatchObject({
    progressPercent: 0,
    completed: false,
  });
  queue.stop();
  queue.push('ended', 999, 1);
  expect(received).toHaveLength(2);
});
test('playback sends queued events serially and ignores invalid positions', async () => {
  const sent: PlaybackEvent[] = [];
  const receipt = jest.fn();
  const queue = new PlaybackQueue(
    async event => {
      sent.push(event);
      return {
        acceptedEventIds: [event.eventId],
        nextSequence: event.sequence + 1,
        enrollment: null,
      };
    },
    receipt,
    jest.fn(),
  );
  queue.push('heartbeat', NaN, 1);
  queue.push('heartbeat', 15, 1);
  queue.push('pause', 16, 1);
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
  expect(sent.map(v => v.sequence)).toEqual([1, 2]);
  expect(receipt).toHaveBeenCalledTimes(2);
  queue.stop();
});
