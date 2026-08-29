ALTER TABLE plans ADD COLUMN demo_amount_minor integer NOT NULL DEFAULT 999 CHECK (demo_amount_minor BETWEEN 0 AND 10000000);
CREATE TABLE demo_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL CHECK (status IN ('succeeded','failed','refunded')),
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);
CREATE INDEX demo_payments_access ON demo_payments(user_id, plan_id, status, period_end);
CREATE INDEX demo_payments_created ON demo_payments(created_at DESC, id);
UPDATE plans SET active=true,demo_amount_minor=CASE code WHEN 'basic' THEN 999 WHEN 'pro' THEN 1999 ELSE 2999 END
WHERE code IN ('basic','pro','premium') AND NOT EXISTS (SELECT 1 FROM billing_products b WHERE b.plan_id=plans.id);
