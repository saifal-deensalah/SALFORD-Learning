import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  api,
  getSessionUser,
  hasSession,
  requestId,
  sessionGeneration,
} from '../services/api';
import { theme } from '../design/types';

type Plan = {
  id: string;
  code: string;
  name: string;
  amountMinor: number;
  currency: string;
  durationDays: number;
};
export const paymentHidden = [
  '1:2003',
  '1:2022',
  '1:2041',
  '1:2045',
  '1:2065',
  '1:2069',
];
export function testPaymentDetails() {
  return {
    card: '4242 4242 4242 4242',
    holder: 'Demo Learner',
    expiry: `12/${String(new Date().getFullYear() + 3).slice(-2)}`,
    cvv: '123',
  };
}
export function validateDemoPayment(
  form: Record<string, string>,
  now = new Date(),
) {
  if ((form.card || '').replace(/\s/g, '') !== '4242424242424242') {
    return 'Use test card 4242 4242 4242 4242 only. Never enter a real card.';
  }
  if ((form.holder || '').trim().length < 2) {
    return 'Enter a test card holder name.';
  }
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(form.expiry || '');
  if (
    !match ||
    new Date(2000 + Number(match[2]), Number(match[1]), 1).getTime() <=
      now.getTime()
  ) {
    return 'Enter a future expiry date as MM/YY.';
  }
  if (form.cvv !== '123') {
    return 'Use test CVV 123.';
  }
  return '';
}
export function DemoCheckout({
  plan,
  scale,
  onSuccess,
  onLogin,
}: {
  plan: string;
  scale: number;
  onSuccess: () => void;
  onLogin: () => void;
}) {
  const [selected, setSelected] = useState<Plan>(),
    [error, setError] = useState(''),
    [needsVerification, setNeedsVerification] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const pending = useRef(false),
    key = useRef(requestId()),
    alive = useRef(true);
  const currentPlan = useRef(plan);
  currentPlan.current = plan;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    key.current = requestId();
    setSelected(undefined);
    setForm({});
    setNeedsVerification(false);
    if (!hasSession()) {
      return;
    }
    setLoading(true);
    setError('');
    api<Plan[]>('/billing/demo-plans')
      .then(plans => {
        if (!active) {
          return;
        }
        const found = plans.find(p => p.code === plan.toLowerCase());
        if (!found) {
          throw new Error('This plan is currently unavailable.');
        }
        setSelected(found);
      })
      .catch(e => {
        if (active) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [plan, attempt]);
  const pay = async () => {
    if (!hasSession()) {
      onLogin();
      return;
    }
    if (!selected || pending.current) {
      return;
    }
    const invalid = validateDemoPayment(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    const epoch = sessionGeneration();
    try {
      // Test fields are visual input only: no card data is stored or sent.
      const result = await api<{ status: string }>(
        '/billing/demo-purchases',
        'POST',
        { planId: selected.id },
        key.current,
      );
      if (result.status !== 'succeeded') {
        throw new Error('The payment was not confirmed. Please retry.');
      }
      if (
        alive.current &&
        epoch === sessionGeneration() &&
        currentPlan.current === plan
      ) {
        setForm({});
        onSuccess();
      }
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setNeedsVerification(
          ['EMAIL_NOT_VERIFIED', 'ACTIVE_VERIFIED_USER_REQUIRED'].includes(
            (e as { code?: string }).code || '',
          ),
        );
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  const position = (x: number, y: number, w: number, h: number) => ({
    left: x * scale,
    top: y * scale,
    width: w * scale,
    height: h * scale,
  });
  return (
    <>
      <Text style={[s.absolute, s.summary, position(20, 204, 350, 24)]}>
        {selected
          ? `${selected.name} · ${selected.currency} ${(
              selected.amountMinor / 100
            ).toFixed(2)} · Demo only`
          : 'Test payment only · No real money'}
      </Text>
      {['Visa', 'PayPal', 'Google Pay'].map((label, i) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() =>
            setError(
              i
                ? `${label} is not connected. Use the Visa test form; no money is charged.`
                : '',
            )
          }
          style={[
            s.absolute,
            position([20, 120, 256][i], 266, [82, 110, 85][i], 41),
          ]}
        />
      ))}
      {[
        ['card', 'Enter Card Number'],
        ['holder', 'Enter Card Holder Name'],
        ['expiry', 'Enter Expiry Date'],
        ['cvv', 'Enter CVV'],
      ].map(([name, placeholder], i) => (
        <TextInput
          key={name}
          testID={`input-${name}`}
          accessibilityLabel={`Test ${name}`}
          value={form[name] || ''}
          onChangeText={value => setForm(f => ({ ...f, [name]: value }))}
          placeholder={placeholder}
          placeholderTextColor="#747688"
          editable={!busy}
          secureTextEntry={name === 'cvv'}
          keyboardType={
            ['card', 'cvv'].includes(name) ? 'number-pad' : 'default'
          }
          maxLength={
            name === 'card'
              ? 19
              : name === 'cvv'
              ? 3
              : name === 'expiry'
              ? 5
              : 100
          }
          autoCorrect={false}
          autoCapitalize="none"
          style={[
            s.absolute,
            s.input,
            position(72, 356 + i * 76, 260, 38),
            { fontSize: 13 * scale },
          ]}
        />
      ))}
      <Pressable
        testID="node-1:2085"
        accessibilityRole="button"
        accessibilityLabel={
          hasSession() ? 'Proceed to demo payment' : 'Log in to continue'
        }
        disabled={busy || loading || (hasSession() && !selected)}
        onPress={() => {
          void pay();
        }}
        style={[s.absolute, position(19, 661, 351, 50)]}
      >
        {(busy || loading) && (
          <View style={s.busy}>
            <ActivityIndicator color="white" />
          </View>
        )}
      </Pressable>
      <View style={[s.absolute, position(20, 719, 350, 130)]}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setForm(testPaymentDetails());
            setError('');
          }}
        >
          <Text style={s.link}>Fill test payment details</Text>
        </Pressable>
        <Text style={s.note}>
          Demo only. Never enter a real card. No charge or auto-renewal.
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {needsVerification && getSessionUser()?.emailVerificationRequired !== false && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={async () => {
              const email = getSessionUser()?.email;
              if (!email || pending.current) {
                return;
              }
              pending.current = true;
              setBusy(true);
              try {
                await api('/auth/email/verification-requests', 'POST', {
                  email,
                });
                if (alive.current) {
                  setError(
                    'Verification requested. Open the email link, then retry the payment. Local development emails are saved by the backend.',
                  );
                }
              } catch (e) {
                if (alive.current) {
                  setError((e as Error).message);
                }
              } finally {
                pending.current = false;
                if (alive.current) {
                  setBusy(false);
                }
              }
            }}
          >
            <Text style={s.link}>Resend verification email</Text>
          </Pressable>
        )}
        {!!error && !selected && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAttempt(n => n + 1)}
          >
            <Text style={s.link}>Retry</Text>
          </Pressable>
        )}
        {!hasSession() && (
          <Pressable accessibilityRole="button" onPress={onLogin}>
            <Text style={s.link}>Log in to continue</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}
const s = StyleSheet.create({
  absolute: { position: 'absolute' },
  input: { padding: 0, color: theme.navy, fontFamily: 'Montserrat-Medium' },
  summary: { color: theme.teal, fontSize: 12 },
  link: {
    color: theme.teal,
    textAlign: 'center',
    padding: 6,
    fontWeight: '600',
  },
  note: { color: '#606978', fontSize: 11, textAlign: 'center' },
  error: { color: theme.danger, fontSize: 12, textAlign: 'center' },
  busy: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: theme.teal,
    justifyContent: 'center',
  },
});
