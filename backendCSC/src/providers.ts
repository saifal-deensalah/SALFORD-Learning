import { readFileSync } from 'node:fs';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import {
  SignedDataVerifier,
  AppStoreServerAPIClient,
  Environment,
} from '@apple/app-store-server-library';
import Stripe from 'stripe';
import {
  type Context,
  type Input,
  type Row,
  fail,
  need,
  ApiError,
} from './core.js';
import { billingEnvironment } from './catalog.js';

export interface VerifiedPurchase {
  externalId: string;
  transactionId: string;
  binding: string;
  productId: string;
  status: string;
  start: string;
  end: string;
  autoRenew: boolean;
  environment: string;
  linkedEvidence?: string;
  amountMinor?: number;
  currency?: string;
}
export class Providers {
  private requireProviderTest() {
    if (this.c.config.billingMode !== 'provider-test' || this.c.config.env !== 'test')
      fail(409, 'REAL_BILLING_DISABLED');
  }
  constructor(
    readonly c: Context,
    private testVerifier?: (
      provider: string,
      evidence: string,
      product: Row,
      user: Row,
    ) => Promise<VerifiedPurchase>,
  ) {
    if (testVerifier && c.config.env !== 'test')
      throw Error('Test provider injection is forbidden outside tests');
  }
  available(provider: string) {
    if (this.c.config.billingMode === 'demo') return false;
    return (
      !!this.testVerifier ||
      (provider === 'google'
        ? !!process.env.GOOGLE_APPLICATION_CREDENTIALS &&
          !!process.env.GOOGLE_PACKAGE_NAME
        : provider === 'apple'
        ? !!process.env.APPLE_BILLING_KEY_FILE &&
          !!process.env.APPLE_ROOT_CERT_FILES &&
          !!process.env.APPLE_BUNDLE_ID
        : !!process.env.STRIPE_SECRET_KEY)
    );
  }
  stripe() {
    this.requireProviderTest();
    if (!process.env.STRIPE_SECRET_KEY) fail(503, 'STRIPE_NOT_CONFIGURED');
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      timeout: 15000,
    });
  }
  apple() {
    this.requireProviderTest();
    const p = process.env;
    if (
      !p.APPLE_BILLING_KEY_FILE ||
      !p.APPLE_BILLING_KEY_ID ||
      !p.APPLE_ISSUER_ID ||
      !p.APPLE_BUNDLE_ID ||
      !p.APPLE_ROOT_CERT_FILES
    )
      fail(503, 'APPLE_BILLING_NOT_CONFIGURED');
    const environment =
      billingEnvironment() === 'production'
        ? Environment.PRODUCTION
        : Environment.SANDBOX;
    return {
      verifier: new SignedDataVerifier(
        p.APPLE_ROOT_CERT_FILES.split(';').map(f => readFileSync(f)),
        true,
        environment,
        p.APPLE_BUNDLE_ID,
        p.APPLE_APP_ID ? Number(p.APPLE_APP_ID) : undefined,
      ),
      client: new AppStoreServerAPIClient(
        readFileSync(p.APPLE_BILLING_KEY_FILE, 'utf8'),
        p.APPLE_BILLING_KEY_ID,
        p.APPLE_ISSUER_ID,
        p.APPLE_BUNDLE_ID,
        environment,
      ),
    };
  }
  async googleRequest(suffix: string, method = 'GET', body?: Row) {
    this.requireProviderTest();
    if (
      !process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      !process.env.GOOGLE_PACKAGE_NAME
    )
      fail(503, 'GOOGLE_BILLING_NOT_CONFIGURED');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = await auth.getClient();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      process.env.GOOGLE_PACKAGE_NAME,
    )}/${suffix}`;
    return (
      await client.request({
        url,
        method: method as 'GET' | 'POST',
        data: body,
        timeout: 15000,
      })
    ).data as Row;
  }
  async verify(
    provider: string,
    evidence: string,
    product: Row,
    user: Row,
  ): Promise<VerifiedPurchase> {
    this.requireProviderTest();
    if (this.testVerifier)
      return this.testVerifier(provider, evidence, product, user);
    if (provider === 'google') {
      let data: Row;
      try {
        data = await this.googleRequest(
          `purchases/subscriptionsv2/tokens/${encodeURIComponent(evidence)}`,
        );
      } catch (e: any) {
        if ([400, 404, 410].includes(e.response?.status))
          fail(422, 'INVALID_PURCHASE');
        throw e;
      }
      const item = data.lineItems?.find(
        (x: Row) =>
          x.productId === product.external_product_id &&
          (!product.external_offer_id ||
            x.offerDetails?.basePlanId === product.external_offer_id),
      );
      if (!item) fail(422, 'PRODUCT_MISMATCH');
      const environment = data.testPurchase ? 'sandbox' : 'production';
      let status =
        (
          {
            SUBSCRIPTION_STATE_ACTIVE: 'active',
            SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
            SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
            SUBSCRIPTION_STATE_EXPIRED: 'expired',
            SUBSCRIPTION_STATE_PENDING: 'pending',
            SUBSCRIPTION_STATE_PAUSED: 'on_hold',
            SUBSCRIPTION_STATE_CANCELED: 'active',
          } as Row
        )[data.subscriptionState] || 'revoked';
      if (new Date(item.expiryTime).getTime() <= Date.now()) status = 'expired';
      const binding =
        data.externalAccountIdentifiers?.obfuscatedExternalAccountId;
      if (!binding || binding !== user.billing_account_id)
        fail(409, 'PURCHASE_ACCOUNT_MISMATCH');
      if (environment !== product.environment)
        fail(422, 'BILLING_ENVIRONMENT_MISMATCH');
      if (
        ['active', 'grace'].includes(status) &&
        data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'
      )
        await this.googleRequest(
          `purchases/subscriptions/${encodeURIComponent(
            item.productId,
          )}/tokens/${encodeURIComponent(evidence)}:acknowledge`,
          'POST',
          {},
        );
      return {
        externalId: evidence,
        transactionId:
          item.latestSuccessfulOrderId || data.latestOrderId || evidence,
        binding,
        productId: item.productId,
        status,
        start: data.startTime || new Date(Date.now() - 1000).toISOString(),
        end: item.expiryTime,
        autoRenew: !!item.autoRenewingPlan?.autoRenewEnabled,
        environment,
        linkedEvidence: data.linkedPurchaseToken,
      };
    }
    if (provider === 'apple') {
      const { client, verifier } = this.apple();
      let original: Row;
      try {
        original = await verifier.verifyAndDecodeTransaction(evidence);
      } catch {
        fail(422, 'INVALID_PURCHASE');
      }
      const state = await client.getAllSubscriptionStatuses(
        String(original.originalTransactionId),
      );
      const candidates =
        state.data?.flatMap(group => group.lastTransactions || []) || [];
      const item = candidates.find(
        x => x.originalTransactionId === original.originalTransactionId,
      );
      if (!item?.signedTransactionInfo) fail(422, 'SUBSCRIPTION_NOT_FOUND');
      const tx = await verifier.verifyAndDecodeTransaction(
        item.signedTransactionInfo,
      );
      const renewal = item.signedRenewalInfo
        ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
        : {};
      if (tx.productId !== product.external_product_id)
        fail(422, 'PRODUCT_MISMATCH');
      if (
        tx.appAccountToken?.toLowerCase() !==
        user.billing_account_id.toLowerCase()
      )
        fail(409, 'PURCHASE_ACCOUNT_MISMATCH');
      const environment =
        tx.environment === Environment.PRODUCTION ? 'production' : 'sandbox';
      if (environment !== product.environment)
        fail(422, 'BILLING_ENVIRONMENT_MISMATCH');
      let status =
        (
          {
            1: 'active',
            2: 'expired',
            3: 'on_hold',
            4: 'grace',
            5: 'revoked',
          } as Row
        )[Number(item.status)] || 'revoked';
      const end = Number(
        status === 'grace' ? renewal.gracePeriodExpiresDate : tx.expiresDate,
      );
      if (!end) fail(422, 'INVALID_SUBSCRIPTION_PERIOD');
      if (end < Date.now() && status !== 'revoked') status = 'expired';
      return {
        externalId: String(tx.originalTransactionId),
        transactionId: String(tx.transactionId),
        binding: tx.appAccountToken!,
        productId: tx.productId!,
        status,
        start: new Date(Number(tx.purchaseDate)).toISOString(),
        end: new Date(end).toISOString(),
        autoRenew: renewal.autoRenewStatus === 1,
        environment,
      };
    }
    fail(422, 'UNSUPPORTED_PROVIDER');
  }
  async webhook(provider: string, i: Input) {
    this.requireProviderTest();
    if (provider === 'apple') {
      let payload: Row;
      try {
        payload = await this.apple().verifier.verifyAndDecodeNotification(
          i.body.signedPayload,
        );
      } catch (e) {
        if (e instanceof ApiError) throw e;
        fail(401, 'INVALID_WEBHOOK_SIGNATURE');
      }
      return { id: need(payload.notificationUUID), payload };
    }
    if (provider === 'google') {
      const audience = process.env.GOOGLE_PUBSUB_AUDIENCE,
        serviceEmail = process.env.GOOGLE_PUBSUB_SERVICE_EMAIL;
      if (!audience || !serviceEmail)
        fail(503, 'GOOGLE_WEBHOOK_NOT_CONFIGURED');
      try {
        const ticket = await new OAuth2Client().verifyIdToken({
          idToken: String(i.headers.authorization || '').replace(
            /^Bearer /,
            '',
          ),
          audience,
        });
        const p = ticket.getPayload();
        if (p?.email !== serviceEmail || !p.email_verified) throw Error();
      } catch {
        fail(401, 'INVALID_WEBHOOK_SIGNATURE');
      }
      let payload;
      try {
        payload = JSON.parse(
          Buffer.from(i.body.message.data, 'base64').toString(),
        );
      } catch {
        fail(400, 'INVALID_WEBHOOK_BODY');
      }
      if (
        payload.packageName !== process.env.GOOGLE_PACKAGE_NAME &&
        !payload.testNotification
      )
        fail(422, 'PACKAGE_MISMATCH');
      return { id: i.body.message.messageId, payload };
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      fail(503, 'STRIPE_WEBHOOK_NOT_CONFIGURED');
    try {
      const event = this.stripe().webhooks.constructEvent(
        need(i.rawBody),
        i.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET,
      );
      if (!!event.livemode !== (billingEnvironment() === 'production'))
        fail(422, 'BILLING_ENVIRONMENT_MISMATCH');
      return { id: event.id, payload: event as unknown as Row };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      fail(401, 'INVALID_WEBHOOK_SIGNATURE');
    }
  }
}
