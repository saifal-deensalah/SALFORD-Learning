import {
  type Context,
  type Handlers,
  type Input,
  type Row,
  need,
  fail,
  uid,
  hash,
  seal,
  unseal,
  enqueue,
  iso,
  audit,
  verified,
  ApiError,
} from './core.js';
import { Providers, type VerifiedPurchase } from './providers.js';
import { billingEnvironment, notify } from './catalog.js';
import { demoPayment } from './demo-billing.js';
export function productView(p: Row) {
  return {
    id: p.id,
    provider: p.provider,
    productId: p.external_product_id,
    offerId: p.external_offer_id,
    interval: p.interval_unit,
    displayPrice:
      p.amount_minor != null
        ? new Intl.NumberFormat('en', {
            style: 'currency',
            currency: p.currency,
          }).format(
            Number(p.amount_minor) /
              10 **
                new Intl.NumberFormat('en', {
                  style: 'currency',
                  currency: p.currency,
                }).resolvedOptions().maximumFractionDigits!,
          )
        : null,
    currency: p.currency || null,
    amountMinor: p.amount_minor == null ? null : Number(p.amount_minor),
    environment: p.environment,
  };
}
export async function planView(c: Context, p: Row) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    features: p.features,
    certificateEnabled: p.certificate_enabled,
    products: c.config.billingMode === 'demo' ? [] : (
      await c.db.query(
        'SELECT * FROM billing_products WHERE plan_id=$1 AND active AND environment=$2 ORDER BY id',
        [p.id, billingEnvironment()],
      )
    ).map(productView),
  };
}
export function subscriptionView(s: Row) {
  return {
    id: s.id,
    planId: s.plan_id,
    provider: s.provider,
    status: s.status,
    periodEnd: iso(s.period_end),
    autoRenew: s.auto_renew,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    accessActive:
      ['active', 'grace'].includes(s.status) &&
      new Date(s.period_end).getTime() > Date.now() &&
      new Date(s.period_start).getTime() <= Date.now() &&
      s.environment === billingEnvironment(),
  };
}
const verificationView = (v: Row) => ({
  id: v.id,
  status: v.status,
  subscriptionId: v.subscription_id || null,
  failureCode: v.status === 'rejected' ? 'PURCHASE_REJECTED' : null,
});
const externalEnabled = () => process.env.EXTERNAL_CHECKOUT_ENABLED === 'true';
export function checkoutView(c: Context, r: Row) {
  return {
    id: r.id,
    status: r.status,
    checkoutUrl:
      r.status === 'pending' && r.checkout_url_ciphertext
        ? unseal(c, r.checkout_url_ciphertext)
        : null,
    expiresAt: iso(r.expires_at),
    subscriptionId: r.subscription_id || null,
  };
}
export function billingHandlers(c: Context, providers: Providers): Handlers {
  return {
    listPlans: async () =>
      Promise.all(
        (
          await c.db.query('SELECT * FROM plans WHERE active ORDER BY code')
        ).map(p => planView(c, p)),
      ),
    getBillingOptions: async i => ({
      methods: [
        ...(c.config.billingMode === 'demo' ? ['demo'] : []),
        ...(i.query.platform === 'ios' && providers.available('apple')
          ? ['apple_iap']
          : []),
        ...(i.query.platform === 'android' && providers.available('google')
          ? ['google_play']
          : []),
        ...(externalEnabled() && providers.available('stripe')
          ? ['external_checkout']
          : []),
      ],
      externalCheckoutEnabled:
        externalEnabled() && providers.available('stripe'),
      accountBindingId: i.user.billing_account_id,
      restoreSupported: c.config.billingMode !== 'demo',
    }),
    verifyPurchase: async i => {
      verified(i, c);
      const p = need(
        (
          await c.db.query(
            'SELECT * FROM billing_products WHERE id=$1 AND provider=$2 AND environment=$3',
            [i.body.productId, i.body.provider, billingEnvironment()],
          )
        )[0],
      );
      if (!providers.available(p.provider))
        fail(503, 'BILLING_PROVIDER_NOT_CONFIGURED');
      const evidence = i.body.purchaseToken || i.body.signedTransaction,
        evidenceHash = hash(c, evidence);
      const [old] = await c.db.query(
        'SELECT * FROM purchase_verifications WHERE provider=$1 AND environment=$2 AND evidence_hash=$3',
        [p.provider, p.environment, evidenceHash],
      );
      if (old) {
        if (old.user_id !== i.user.id) fail(409, 'PURCHASE_ALREADY_LINKED');
        if (old.billing_product_id !== p.id) fail(409, 'PRODUCT_MISMATCH');
        return verificationView(old);
      }
      const [v] = await c.db.query(
        'INSERT INTO purchase_verifications(user_id,billing_product_id,provider,environment,evidence_hash,evidence_ciphertext) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        [
          i.user.id,
          p.id,
          p.provider,
          p.environment,
          evidenceHash,
          seal(c, evidence),
        ],
      );
      await enqueue(
        c,
        'billing.verify',
        v.id,
        { verificationId: v.id },
        `verify:${v.id}`,
      );
      return verificationView(v);
    },
    getVerification: async i =>
      verificationView(
        need(
          (
            await c.db.query(
              'SELECT * FROM purchase_verifications WHERE id=$1 AND user_id=$2',
              [i.params.verificationId, i.user.id],
            )
          )[0],
        ),
      ),
    getSubscriptions: async i => c.config.billingMode === 'demo'
      ? (await c.db.query('SELECT * FROM demo_payments WHERE user_id=$1 ORDER BY created_at DESC,id', [i.user.id])).map(p => ({
          id: p.id, planId: p.plan_id, provider: 'demo',
          status: p.status === 'refunded' ? 'revoked' : p.status === 'failed' ? 'pending' : demoPayment(p).accessActive ? 'active' : 'expired',
          periodEnd: iso(p.period_end), autoRenew: false, cancelAtPeriodEnd: false, accessActive: demoPayment(p).accessActive,
        }))
      : (
        await c.db.query(
          'SELECT * FROM subscriptions WHERE user_id=$1 AND environment=$2 ORDER BY period_end DESC',
          [i.user.id, billingEnvironment()],
        )
      ).map(subscriptionView),
    manageSubscription: async i => {
      const s = need(
        (
          await c.db.query(
            'SELECT * FROM subscriptions WHERE id=$1 AND user_id=$2',
            [i.params.subscriptionId, i.user.id],
          )
        )[0],
      );
      if (s.provider === 'apple')
        return {
          url: 'https://apps.apple.com/account/subscriptions',
          expiresAt: null,
          provider: 'apple',
        };
      if (s.provider === 'google')
        return {
          url: `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(
            process.env.GOOGLE_PACKAGE_NAME || 'com.cscapp',
          )}`,
          expiresAt: null,
          provider: 'google',
        };
      const customer = need(
        (
          await c.db.query(
            "SELECT * FROM billing_customers WHERE user_id=$1 AND provider='stripe' AND environment=$2",
            [i.user.id, billingEnvironment()],
          )
        )[0],
      );
      const portal = await providers.stripe().billingPortal.sessions.create({
        customer: customer.external_customer_id,
        return_url: c.config.origin + '/billing/return',
      });
      return { url: portal.url, expiresAt: null, provider: 'stripe' };
    },
    createCheckout: async i => {
      verified(i, c);
      if (!externalEnabled()) fail(403, 'CHANNEL_NOT_ALLOWED');
      const p = need(
        (
          await c.db.query(
            "SELECT * FROM billing_products WHERE id=$1 AND provider='stripe' AND active AND environment=$2",
            [i.body.productId, billingEnvironment()],
          )
        )[0],
      );
      const stripe = providers.stripe();
      let [customer] = await c.db.query(
        "SELECT * FROM billing_customers WHERE user_id=$1 AND provider='stripe' AND environment=$2",
        [i.user.id, billingEnvironment()],
      );
      if (!customer) {
        const sc = await stripe.customers.create(
          { email: i.user.email, metadata: { userId: i.user.id } },
          { idempotencyKey: `customer:${i.user.id}` },
        );
        [customer] = await c.db.query(
          "INSERT INTO billing_customers(user_id,provider,environment,external_customer_id) VALUES($1,'stripe',$2,$3) ON CONFLICT(user_id,provider,environment) DO UPDATE SET external_customer_id=EXCLUDED.external_customer_id RETURNING *",
          [i.user.id, billingEnvironment(), sc.id],
        );
      }
      const checkout = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: customer.external_customer_id,
          line_items: [{ price: p.external_product_id, quantity: 1 }],
          client_reference_id: i.user.id,
          subscription_data: {
            metadata: { userId: i.user.id, productId: p.id },
          },
          success_url: c.config.origin + '/billing/return?status=returned',
          cancel_url: c.config.origin + '/billing/return?status=canceled',
        },
        {
          idempotencyKey: `checkout:${i.user.id}:${i.headers['idempotency-key']}`,
        },
      );
      const [row] = await c.db.query(
        "INSERT INTO checkout_sessions(user_id,billing_product_id,external_session_id,status,expires_at,checkout_url_ciphertext) VALUES($1,$2,$3,'pending',$4,$5) RETURNING *",
        [
          i.user.id,
          p.id,
          checkout.id,
          new Date(checkout.expires_at * 1000).toISOString(),
          checkout.url ? seal(c, checkout.url) : null,
        ],
      );
      return checkoutView(c, row);
    },
    getCheckout: async i => {
      const r = need(
        (
          await c.db.query(
            'SELECT * FROM checkout_sessions WHERE id=$1 AND user_id=$2',
            [i.params.checkoutId, i.user.id],
          )
        )[0],
      );
      if (
        r.status === 'pending' &&
        new Date(r.expires_at).getTime() < Date.now()
      ) {
        r.status = 'expired';
        await c.db.query(
          "UPDATE checkout_sessions SET status='expired' WHERE id=$1",
          [r.id],
        );
      }
      return checkoutView(c, r);
    },
    createPlan: async i => writePlan(c, i, false),
    updatePlan: async i => writePlan(c, i, true),
    mapProduct: async i => {
      const b = i.body;
      need(
        (
          await c.db.query('SELECT id FROM plans WHERE id=$1', [
            i.params.planId,
          ])
        )[0],
      );
      let amount = null,
        currency = null;
      if (b.provider === 'stripe') {
        const price = await providers.stripe().prices.retrieve(b.productId);
        if (
          !price.active ||
          price.type !== 'recurring' ||
          price.recurring?.interval !== b.interval ||
          price.livemode !== (b.environment === 'production')
        )
          fail(422, 'INVALID_PROVIDER_PRODUCT');
        amount = price.unit_amount;
        currency = price.currency.toUpperCase();
      } else if (b.provider === 'google' && providers.available('google')) {
        const product = await providers.googleRequest(
          `subscriptions/${encodeURIComponent(b.productId)}`,
        );
        if (!product.basePlans?.some((x: Row) => x.basePlanId === b.offerId))
          fail(422, 'INVALID_PROVIDER_PRODUCT');
      }
      // Apple product IDs are provisioned in App Store Connect; receipts verify them before access.
      const [p] = await c.db.query(
        'INSERT INTO billing_products(plan_id,provider,environment,external_product_id,external_offer_id,interval_unit,amount_minor,currency,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [
          i.params.planId,
          b.provider,
          b.environment,
          b.productId,
          b.offerId,
          b.interval,
          amount,
          currency,
          b.active,
        ],
      );
      await audit(c, i, 'map_product', 'plan', i.params.planId);
      return productView(p);
    },
    receiveAppleEvent: i => receive(c, providers, 'apple', i),
    receiveGoogleEvent: i => receive(c, providers, 'google', i),
    receiveStripeEvent: i => receive(c, providers, 'stripe', i),
  };
}
async function writePlan(c: Context, i: Input, update: boolean) {
  return c.db.tx(async db => {
    const t = { ...c, db },
      b = i.body,
      id = update ? i.params.planId : uid();
    if (update) {
      const previous = need(
        (await db.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE', [id]))[0],
      );
      const oldCourses = (
        await db.query(
          'SELECT course_id FROM plan_courses WHERE plan_id=$1 ORDER BY course_id',
          [id],
        )
      ).map(r => r.course_id);
      const changed =
        JSON.stringify(oldCourses) !==
          JSON.stringify([...new Set(b.courseIds)].sort()) ||
        previous.certificate_enabled !== b.certificateEnabled ||
        JSON.stringify(previous.features) !== JSON.stringify(b.features);
      if (
        changed &&
        (
          await db.query(
            c.config.billingMode === 'demo'
              ? "SELECT id FROM demo_payments WHERE plan_id=$1 AND period_end>now() AND status='succeeded' LIMIT 1"
              : "SELECT id FROM subscriptions WHERE plan_id=$1 AND period_end>now() AND status IN ('active','grace') LIMIT 1",
            [id],
          )
        ).length
      )
        fail(409, 'PAID_PLAN_TERMS_IMMUTABLE');
    }
    if (
      b.active &&
      c.config.billingMode !== 'demo' &&
      !(
        await db.query(
          'SELECT id FROM billing_products WHERE plan_id=$1 AND active',
          [id],
        )
      ).length
    )
      fail(422, 'PRODUCT_MAPPING_REQUIRED');
    await db.query(
      'INSERT INTO plans(id,code,name,features,certificate_enabled,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET code=$2,name=$3,features=$4,certificate_enabled=$5,active=$6',
      [
        id,
        b.code,
        b.name,
        JSON.stringify(b.features),
        b.certificateEnabled,
        b.active,
      ],
    );
    await db.query('DELETE FROM plan_courses WHERE plan_id=$1', [id]);
    if (b.amountMinor !== undefined)
      await db.query('UPDATE plans SET demo_amount_minor=$2 WHERE id=$1', [id, b.amountMinor]);
    for (const courseId of new Set(b.courseIds))
      await db.query(
        'INSERT INTO plan_courses(plan_id,course_id) VALUES($1,$2)',
        [id, courseId],
      );
    await audit(t, i, update ? 'update_plan' : 'create_plan', 'plan', id);
    return planView(
      t,
      (await db.query('SELECT * FROM plans WHERE id=$1', [id]))[0],
    );
  });
}
async function receive(
  c: Context,
  providers: Providers,
  provider: string,
  i: Input,
) {
  const event = await providers.webhook(provider, i);
  await c.db.tx(async db => {
    const [r] = await db.query(
      'INSERT INTO webhook_events(provider,environment,external_event_id,payload_ciphertext) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
      [
        provider,
        billingEnvironment(),
        event.id,
        seal(c, JSON.stringify(event.payload)),
      ],
    );
    if (r)
      await enqueue(
        { ...c, db },
        'billing.webhook',
        r.id,
        { webhookId: r.id },
        `webhook:${r.id}`,
      );
  });
}
export async function persistPurchase(
  c: Context,
  user: Row,
  product: Row,
  v: VerifiedPurchase,
  verificationId?: string,
) {
  return c.db.tx(async db => {
    const t = { ...c, db };
    if (
      v.binding.toLowerCase() !== user.billing_account_id.toLowerCase() ||
      v.productId !== product.external_product_id ||
      v.environment !== product.environment
    )
      fail(422, 'PURCHASE_MISMATCH');
    // Raw Google purchase tokens are encrypted only in evidence; never use them as public IDs.
    const external =
      product.provider === 'google' ? hash(c, v.externalId) : v.externalId;
    const [existing] = await db.query(
      'SELECT * FROM subscriptions WHERE provider=$1 AND environment=$2 AND external_subscription_id=$3 FOR UPDATE',
      [product.provider, product.environment, external],
    );
    if (existing && existing.user_id !== user.id)
      fail(409, 'PURCHASE_ALREADY_LINKED');
    const effectiveStatus =
      existing?.access_revoked_until &&
      new Date(existing.access_revoked_until).getTime() >
        new Date(v.start).getTime()
        ? 'revoked'
        : v.status;
    const [s] = await db.query(
      `INSERT INTO subscriptions(user_id,plan_id,billing_product_id,provider,environment,external_subscription_id,status,period_start,period_end,auto_renew,cancel_at_period_end,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(provider,environment,external_subscription_id) DO UPDATE SET plan_id=$2,billing_product_id=$3,status=$7,period_start=$8,period_end=$9,auto_renew=$10,cancel_at_period_end=$11,verified_at=now(),updated_at=now() RETURNING *`,
      [
        user.id,
        product.plan_id,
        product.id,
        product.provider,
        product.environment,
        external,
        effectiveStatus,
        v.start,
        v.end,
        v.autoRenew,
        !v.autoRenew,
      ],
    );
    if (verificationId)
      await db.query(
        'UPDATE purchase_verifications SET status=$2,subscription_id=$3 WHERE id=$1',
        [verificationId, v.status === 'pending' ? 'pending' : 'verified', s.id],
      );
    if (v.linkedEvidence)
      await db.query(
        "UPDATE subscriptions SET status='revoked',updated_at=now() WHERE provider='google' AND external_subscription_id=$1 AND environment=$2 AND id<>$3",
        [hash(c, v.linkedEvidence), v.environment, s.id],
      );
    if (v.amountMinor != null && v.currency)
      await db.query(
        "INSERT INTO payment_transactions(subscription_id,provider,environment,external_transaction_id,kind,currency,amount_minor,occurred_at) VALUES($1,$2,$3,$4,'charge',$5,$6,$7) ON CONFLICT DO NOTHING",
        [
          s.id,
          product.provider,
          product.environment,
          v.transactionId,
          v.currency,
          v.amountMinor,
          v.start,
        ],
      );
    if (
      user.status === 'active' &&
      (!existing ||
        existing.status !== s.status ||
        iso(existing.period_end) !== iso(s.period_end))
    )
      await notify(
        t,
        user.id,
        'billing',
        'Subscription updated',
        `Subscription status: ${s.status}`,
        'subscription',
        s.id,
        `billing:${s.id}:${s.status}:${iso(s.period_end)}`,
      );
    return s;
  });
}
export async function verifyStoredPurchase(
  c: Context,
  providers: Providers,
  id: string,
) {
  const v = need(
    (
      await c.db.query('SELECT * FROM purchase_verifications WHERE id=$1', [id])
    )[0],
  );
  const p = need(
      (
        await c.db.query('SELECT * FROM billing_products WHERE id=$1', [
          v.billing_product_id,
        ])
      )[0],
    ),
    u = need(
      (await c.db.query('SELECT * FROM users WHERE id=$1', [v.user_id]))[0],
    );
  try {
    const result = await providers.verify(
      p.provider,
      unseal(c, v.evidence_ciphertext),
      p,
      u,
    );
    await persistPurchase(c, u, p, result, v.id);
    if (result.status === 'pending')
      throw new ApiError(503, 'PURCHASE_PENDING');
  } catch (e) {
    if (e instanceof ApiError && [400, 401, 409, 422].includes(e.status)) {
      await c.db.query(
        "UPDATE purchase_verifications SET status='rejected' WHERE id=$1",
        [id],
      );
      return;
    }
    throw e;
  }
}
export async function processWebhook(
  c: Context,
  providers: Providers,
  id: string,
) {
  const event = need(
    (await c.db.query('SELECT * FROM webhook_events WHERE id=$1', [id]))[0],
  );
  if (event.status === 'processed') return;
  const payload = JSON.parse(unseal(c, event.payload_ciphertext));
  if (event.provider === 'google') {
    const evidence =
      payload.subscriptionNotification?.purchaseToken ||
      payload.voidedPurchaseNotification?.purchaseToken;
    if (evidence) {
      let [v] = await c.db.query(
        "SELECT id FROM purchase_verifications WHERE provider='google' AND environment=$1 AND evidence_hash=$2",
        [event.environment, hash(c, evidence)],
      );
      if (!v && !payload.voidedPurchaseNotification) {
        const state = await providers.googleRequest(
          `purchases/subscriptionsv2/tokens/${encodeURIComponent(evidence)}`,
        );
        const [user] = await c.db.query(
          'SELECT * FROM users WHERE billing_account_id=$1',
          [
            state.externalAccountIdentifiers?.obfuscatedExternalAccountId ||
              null,
          ],
        );
        for (const item of state.lineItems || []) {
          const [product] = await c.db.query(
            "SELECT * FROM billing_products WHERE provider='google' AND environment=$1 AND external_product_id=$2 AND external_offer_id=$3",
            [
              event.environment,
              item.productId,
              item.offerDetails?.basePlanId || '',
            ],
          );
          if (user && product) {
            [v] = await c.db.query(
              "INSERT INTO purchase_verifications(user_id,billing_product_id,provider,environment,evidence_hash,evidence_ciphertext) VALUES($1,$2,'google',$3,$4,$5) ON CONFLICT(provider,environment,evidence_hash) DO UPDATE SET evidence_hash=EXCLUDED.evidence_hash RETURNING *",
              [
                user.id,
                product.id,
                event.environment,
                hash(c, evidence),
                seal(c, evidence),
              ],
            );
            break;
          }
        }
      }
      if (v) await verifyStoredPurchase(c, providers, v.id);
      if (payload.voidedPurchaseNotification)
        await c.db.query(
          "UPDATE subscriptions SET status='revoked',access_revoked_until=period_end,updated_at=now() WHERE provider='google' AND environment=$1 AND external_subscription_id=$2",
          [event.environment, hash(c, evidence)],
        );
    }
  } else if (event.provider === 'apple') {
    const signed = payload.data?.signedTransactionInfo;
    if (signed) {
      const tx = await providers
        .apple()
        .verifier.verifyAndDecodeTransaction(signed);
      const [user] = await c.db.query(
        'SELECT * FROM users WHERE billing_account_id=$1',
        [tx.appAccountToken],
      );
      const [product] = await c.db.query(
        "SELECT * FROM billing_products WHERE provider='apple' AND environment=$1 AND external_product_id=$2",
        [event.environment, tx.productId],
      );
      if (user && product) {
        const verified = await providers.verify('apple', signed, product, user);
        await persistPurchase(c, user, product, verified);
      }
    }
  } else {
    const object = payload.data?.object;
    let subId =
      object?.object === 'subscription'
        ? object.id
        : typeof object?.subscription === 'string'
        ? object.subscription
        : object?.parent?.subscription_details?.subscription;
    if (
      payload.type === 'charge.refunded' &&
      object?.refunded &&
      object?.invoice
    ) {
      const invoice: any = await providers
        .stripe()
        .invoices.retrieve(
          typeof object.invoice === 'string'
            ? object.invoice
            : object.invoice.id,
        );
      subId =
        invoice.subscription ||
        invoice.parent?.subscription_details?.subscription;
      if (subId) {
        const end = new Date(invoice.period_end * 1000).toISOString();
        await c.db.query(
          "UPDATE subscriptions SET status='revoked',access_revoked_until=GREATEST(COALESCE(access_revoked_until,period_start),$3::timestamptz),updated_at=now() WHERE provider='stripe' AND environment=$1 AND external_subscription_id=$2 AND period_start<$3::timestamptz",
          [event.environment, subId, end],
        );
        const [subscription] = await c.db.query(
          "SELECT id FROM subscriptions WHERE provider='stripe' AND environment=$1 AND external_subscription_id=$2",
          [event.environment, subId],
        );
        if (subscription)
          await c.db.query(
            "INSERT INTO payment_transactions(subscription_id,provider,environment,external_transaction_id,kind,currency,amount_minor,occurred_at) VALUES($1,'stripe',$2,$3,'refund',$4,$5,now()) ON CONFLICT DO NOTHING",
            [
              subscription.id,
              event.environment,
              object.id,
              object.currency.toUpperCase(),
              object.amount_refunded,
            ],
          );
      }
    }
    if (subId) await syncStripe(c, providers, subId);
    if (object?.object === 'checkout.session') {
      const [checkout] = await c.db.query(
        'SELECT id FROM checkout_sessions WHERE external_session_id=$1',
        [object.id],
      );
      if (checkout) await syncCheckout(c, providers, checkout.id);
    }
  }
  await c.db.query(
    "UPDATE webhook_events SET status='processed',processed_at=now() WHERE id=$1",
    [id],
  );
}
export async function syncStripe(c: Context, providers: Providers, id: string) {
  const stripe = providers.stripe(),
    s: any = await stripe.subscriptions.retrieve(id, {
      expand: ['latest_invoice'],
    });
  const customerId =
    typeof s.customer === 'string' ? s.customer : s.customer.id;
  const [customer] = await c.db.query(
    "SELECT * FROM billing_customers WHERE provider='stripe' AND environment=$1 AND external_customer_id=$2",
    [billingEnvironment(), customerId],
  );
  if (!customer) return;
  const price = s.items.data[0]?.price;
  const [p] = await c.db.query(
    "SELECT * FROM billing_products WHERE provider='stripe' AND environment=$1 AND external_product_id=$2",
    [billingEnvironment(), price?.id],
  );
  if (!p) return;
  const u = need(
    (
      await c.db.query('SELECT * FROM users WHERE id=$1', [customer.user_id])
    )[0],
  );
  if (s.metadata.userId !== u.id || s.metadata.productId !== p.id)
    fail(422, 'PURCHASE_MISMATCH');
  const end = s.current_period_end || s.items.data[0]?.current_period_end,
    start = s.current_period_start || s.items.data[0]?.current_period_start;
  let status =
    (
      {
        active: 'active',
        trialing: 'active',
        past_due: 'on_hold',
        unpaid: 'on_hold',
        incomplete: 'pending',
        incomplete_expired: 'expired',
        canceled: 'expired',
        paused: 'on_hold',
      } as Row
    )[s.status] || 'revoked';
  const normalized: VerifiedPurchase = {
    externalId: s.id,
    transactionId: s.latest_invoice?.id || s.id,
    binding: u.billing_account_id,
    productId: price.id,
    status,
    start: new Date(start * 1000).toISOString(),
    end: new Date(end * 1000).toISOString(),
    autoRenew: !s.cancel_at_period_end,
    environment: s.livemode ? 'production' : 'sandbox',
    ...(s.latest_invoice?.paid
      ? {
          amountMinor: s.latest_invoice.amount_paid,
          currency: s.latest_invoice.currency.toUpperCase(),
        }
      : {}),
  };
  return persistPurchase(c, u, p, normalized);
}

export async function syncCheckout(
  c: Context,
  providers: Providers,
  id: string,
) {
  const checkout = need(
    (await c.db.query('SELECT * FROM checkout_sessions WHERE id=$1', [id]))[0],
  );
  const remote = await providers
    .stripe()
    .checkout.sessions.retrieve(checkout.external_session_id);
  if (
    remote.client_reference_id !== checkout.user_id ||
    remote.livemode !== (billingEnvironment() === 'production')
  )
    fail(422, 'CHECKOUT_ACCOUNT_MISMATCH');
  if (remote.status === 'expired') {
    await c.db.query(
      "UPDATE checkout_sessions SET status='expired' WHERE id=$1 AND status<>'succeeded'",
      [id],
    );
    return;
  }
  const subscriptionId =
    typeof remote.subscription === 'string'
      ? remote.subscription
      : remote.subscription?.id;
  if (
    !subscriptionId ||
    !['paid', 'no_payment_required'].includes(remote.payment_status)
  )
    return;
  const subscription = await syncStripe(c, providers, subscriptionId);
  if (
    !subscription ||
    subscription.user_id !== checkout.user_id ||
    subscription.billing_product_id !== checkout.billing_product_id
  )
    fail(422, 'CHECKOUT_PRODUCT_MISMATCH');
  await c.db.query(
    'UPDATE checkout_sessions SET status=$2,subscription_id=$3 WHERE id=$1',
    [
      id,
      subscriptionView(subscription).accessActive ? 'succeeded' : 'processing',
      subscription.id,
    ],
  );
}
