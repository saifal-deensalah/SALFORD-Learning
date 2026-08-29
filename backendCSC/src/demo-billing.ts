import {
  type Context,
  type Input,
  type Row,
  type Handlers,
  need,
  fail,
  verified,
  iso,
  audit,
  paginate,
} from './core.js';

export function demoOnly(c: Context) {
  if (c.config.billingMode !== 'demo') fail(409, 'DEMO_BILLING_DISABLED');
}
export const demoPlan = (p: Row) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  features: p.features,
  certificateEnabled: p.certificate_enabled,
  active: p.active,
  amountMinor: Number(p.demo_amount_minor),
  currency: 'USD',
  durationDays: 30,
  courseIds: p.course_ids || [],
});
export async function demoPlans(c: Context, activeOnly = true) {
  return (
    await c.db.query(
      `SELECT p.*, ARRAY(SELECT course_id FROM plan_courses WHERE plan_id=p.id ORDER BY course_id) course_ids
    FROM plans p WHERE ($1::boolean=false OR p.active) ORDER BY p.demo_amount_minor,p.id`,
      [activeOnly]
    )
  ).map(demoPlan);
}
export function demoPayment(p: Row) {
  return {
    id: p.id,
    userId: p.user_id,
    planId: p.plan_id,
    amountMinor: Number(p.amount_minor),
    currency: p.currency,
    status: p.status,
    periodEnd: iso(p.period_end),
    createdAt: iso(p.created_at),
    accessActive:
      p.status === 'succeeded' &&
      new Date(p.period_end).getTime() > Date.now() &&
      new Date(p.period_start).getTime() <= Date.now(),
  };
}
export async function purchaseDemo(c: Context, i: Input, userId: string) {
  demoOnly(c);
  return c.db.tx(async (db) => {
    const t = { ...c, db };
    const user = need(
      (
        await db.query(
          'SELECT id,status,email_verified_at FROM users WHERE id=$1 FOR UPDATE',
          [userId]
        )
      )[0]
    );
    if (user.status !== 'active' || (!c.config.localEmailAuth && !user.email_verified_at))
      fail(409, 'ACTIVE_VERIFIED_USER_REQUIRED');
    const plan = need(
      (
        await db.query(
          'SELECT * FROM plans WHERE id=$1 AND active FOR UPDATE',
          [i.body.planId]
        )
      )[0]
    );
    const [existing] = await db.query(
      "SELECT * FROM demo_payments WHERE user_id=$1 AND plan_id=$2 AND status='succeeded' AND period_end>now() AND period_start<=now() ORDER BY created_at DESC LIMIT 1",
      [userId, plan.id]
    );
    if (existing) return demoPayment(existing);
    const [payment] = await db.query(
      'INSERT INTO demo_payments(user_id,plan_id,amount_minor,status) VALUES($1,$2,$3,$4) RETURNING *',
      [userId, plan.id, plan.demo_amount_minor, 'succeeded']
    );
    await audit(t, i, 'simulate_payment', 'demo_payment', payment.id);
    return demoPayment(payment);
  });
}
export function demoBillingHandlers(c: Context): Handlers {
  return {
    listDemoPlans: async () => {
      demoOnly(c);
      return demoPlans(c);
    },
    createDemoPurchase: async (i) => {
      verified(i, c);
      return purchaseDemo(c, i, i.user.id);
    },
    adminDemoPayments: async (i) => {
      const rows = await c.db.query(
        `SELECT p.*,u.name user_name,u.email user_email,pl.name plan_name
        FROM demo_payments p JOIN users u ON u.id=p.user_id JOIN plans pl ON pl.id=p.plan_id
        WHERE ($1='' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%') AND ($2='' OR p.status=$2)
        ORDER BY p.created_at DESC,p.id`,
        [i.query.q || '', i.query.status || '']
      );
      return paginate(
        c,
        rows.map((p) => ({
          ...demoPayment(p),
          userName: p.user_name,
          userEmail: p.user_email,
          planName: p.plan_name,
        })),
        i.query,
        'admin:demo-payments'
      );
    },
    adminPlans: async () => demoPlans(c, false),
  };
}
