import 'reflect-metadata';
import {
  Controller,
  Module,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Req,
  Res,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  type Context,
  type Config,
  type Input,
  type Handlers,
  ROOT,
  readJson,
  loadConfig,
  connect,
  migrate,
  ApiError,
  fail,
  uid,
  limit,
  idempotent,
  equal,
} from './core.js';
import { authenticate, authHandlers } from './auth.js';
import { catalogHandlers } from './catalog.js';
import { learningHandlers } from './learning.js';
import { mediaHandlers, mountMedia } from './media.js';
import { billingHandlers } from './billing.js';
import { notificationHandlers } from './notifications.js';
import { Providers } from './providers.js';
import { Jobs } from './jobs.js';
import { mountAccountPages } from './account-pages.js';
import { adminHandlers } from './admin.js';
import { demoBillingHandlers } from './demo-billing.js';
const require = createRequire(import.meta.url),
  Ajv = require('ajv').default,
  addFormats = require('ajv-formats');
export const contract = readJson(path.join(ROOT, 'contracts/openapi.json'));
export const operations = Object.entries(contract.paths).flatMap(
  ([route, methods]) =>
    Object.entries(methods as any).map(([method, value]) => ({
      route,
      method,
      ...(value as any),
    })),
);
export class Runtime {
  providers: Providers;
  jobs: Jobs;
  private validators = new Map<string, any>();
  constructor(
    readonly c: Context,
    testVerifier?: ConstructorParameters<typeof Providers>[1],
  ) {
    this.providers = new Providers(c, testVerifier);
    this.jobs = new Jobs(c, this.providers);
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema(contract, 'contract');
    for (const op of operations) {
      const schema = op.requestBody?.content?.['application/json']?.schema;
      if (schema)
        this.validators.set(
          `${op.operationId}:body`,
          ajv.compile({
            $ref: `contract#/paths/${op.route
              .replace(/~/g, '~0')
              .replace(/\//g, '~1')}/${
              op.method
            }/requestBody/content/application~1json/schema`,
          }),
        );
      for (const location of ['path', 'query', 'header']) {
        const fields = (op.parameters || []).filter(
            (p: any) => p.in === location,
          ),
          properties = Object.fromEntries(
            fields.map((p: any) => [p.name, p.schema]),
          );
        const params = new Ajv({
          strict: false,
          coerceTypes: location === 'query',
          allErrors: true,
        });
        addFormats(params);
        this.validators.set(
          `${op.operationId}:${location}`,
          params.compile({
            type: 'object',
            properties,
            additionalProperties: false,
            required: fields
              .filter((p: any) => p.required)
              .map((p: any) => p.name),
          }),
        );
      }
    }
    const defined = this.handlers();
    for (const op of operations)
      if (!defined[op.operationId])
        throw Error(`Unimplemented operation: ${op.operationId}`);
  }
  handlers(c = this.c): Handlers {
    return {
      ...authHandlers(c),
      ...catalogHandlers(c),
      ...learningHandlers(c),
      ...mediaHandlers(c),
      ...billingHandlers(c, this.providers),
      ...notificationHandlers(c),
      ...adminHandlers(c),
      ...demoBillingHandlers(c),
      liveness: async () => ({ status: 'ok', version: '1.0.0' }),
      readiness: async () => {
        try {
          await c.db.query('SELECT 1');
          await this.jobs.ready();
          return { status: 'ok', version: '1.0.0' };
        } catch {
          fail(503, 'SERVICE_UNAVAILABLE');
        }
      },
    };
  }
  async handle(op: any, req: Request, res: Response) {
    const requestId = uid();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    try {
      const params = { ...req.params },
        query = { ...req.query },
        headers = Object.fromEntries(
          (op.parameters || [])
            .filter((p: any) => p.in === 'header')
            .map((p: any) => [p.name, req.get(p.name)])
            .filter(([, v]: any) => v !== undefined),
        );
      for (const [location, data] of [
        ['path', params],
        ['query', query],
        ['header', headers],
      ] as const) {
        if (!this.validators.get(`${op.operationId}:${location}`)(data))
          fail(422, 'VALIDATION_ERROR');
      }
      const body = req.body || {},
        validator = this.validators.get(`${op.operationId}:body`);
      if (validator && !validator(body)) fail(422, 'VALIDATION_ERROR');
      if (
        !validator &&
        Object.keys(body).length &&
        !op.route.startsWith('/webhooks/')
      )
        fail(422, 'UNEXPECTED_BODY');
      const ip = req.ip || 'unknown';
      if (!op.route.startsWith('/health/'))
        await limit(this.c, `ip:${ip}`, 240, 60);
      const privateOperation = !op['x-roles'].some((role: string) =>
        ['public', 'probe', 'provider'].includes(role),
      );
      let user: any;
      if (privateOperation) {
        try {
          user = await authenticate(this.c, req.get('authorization'));
        } catch (e) {
          if (e instanceof ApiError && e.status === 404)
            fail(401, 'SESSION_REVOKED');
          throw e;
        }
        if (!op['x-roles'].includes(user.role)) fail(403, 'FORBIDDEN');
        if (
          op['x-requires-recent-authentication-seconds'] &&
          Date.now() - new Date(user.auth_time).getTime() >
            op['x-requires-recent-authentication-seconds'] * 1000
        )
          fail(403, 'RECENT_AUTHENTICATION_REQUIRED');
      }
      if (
        op['x-roles'].includes('admin') &&
        !op['x-roles'].includes('student') &&
        this.c.config.env === 'production'
      ) {
        if (
          process.env.ADMIN_API_ENABLED !== 'true' ||
          !equal(
            req.get('x-admin-key') || '',
            process.env.ADMIN_API_KEY || 'not-configured',
          )
        )
          fail(403, 'ADMIN_GATEWAY_REQUIRED');
      }
      const input: Input = {
        body,
        query,
        params,
        headers: {
          ...req.headers,
          ...Object.fromEntries(
            Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
          ),
        },
        user,
        rawBody: (req as any).rawBody,
        requestId,
        ip,
      };
      if (this.c.config.billingMode === 'demo' &&
          (['verifyPurchase', 'getVerification', 'manageSubscription', 'createCheckout', 'getCheckout', 'mapProduct'].includes(op.operationId) || op.route.startsWith('/webhooks/')))
        fail(409, 'REAL_BILLING_DISABLED', 'Only simulated payments are enabled. No money can be charged.');
      const isIdempotent = (op.parameters || []).some(
        (p: any) => p.name === 'Idempotency-Key',
      );
      const result = isIdempotent
        ? await idempotent(this.c, input, op.operationId, c =>
            this.handlers(c)[op.operationId](input),
          )
        : await this.handlers()[op.operationId](input);
      const status = Number(
        Object.keys(op.responses).find(key => /^2\d\d$/.test(key)),
      );
      if (status === 204) res.status(204).end();
      else res.status(status).json({ data: result });
    } catch (e: any) {
      let status = e instanceof ApiError ? e.status : 500,
        code = e instanceof ApiError ? e.code : 'INTERNAL_ERROR';
      if (e.code === '23505') {
        status = 409;
        code = 'RESOURCE_CONFLICT';
      }
      if (['23503', '23514', '22P02'].includes(e.code)) {
        status = 422;
        code = 'VALIDATION_ERROR';
      }
      if (status === 429) res.setHeader('Retry-After', '60');
      res.status(status).json({
        error: {
          code,
          message:
            e instanceof ApiError
              ? e.message
              : 'Request could not be completed',
          requestId,
        },
      });
      if (status === 500)
        console.error(
          JSON.stringify({
            event: 'request_failed',
            operation: op.operationId,
            requestId,
            errorType: e.constructor?.name,
          }),
        );
    } finally {
      if (this.c.config.env !== 'test')
        console.log(
          JSON.stringify({
            event: 'http',
            operation: op.operationId,
            status: res.statusCode,
            requestId,
            durationMs: Date.now() - started,
          }),
        );
    }
  }
  async close() {
    await this.jobs.close();
    await this.c.db.close();
  }
}
export async function createRuntime(
  options: {
    config?: Partial<Config>;
    testVerifier?: ConstructorParameters<typeof Providers>[1];
  } = {},
) {
  const config = loadConfig(options.config);
  const db = await connect(config);
  try {
    // Cloud runtime credentials have DML permissions only; deploy DDL separately.
    if (config.env !== 'production' && config.dbMode === 'embedded') await migrate(db);
    return new Runtime({ config, db }, options.testVerifier);
  } catch (e) {
    await db.close();
    throw e;
  }
}
export async function createApp(runtime: Runtime) {
  const controllers = [];
  for (const tag of new Set(operations.map(op => op.tags[0]))) {
    class DomainController {}
    Object.defineProperty(DomainController, 'name', {
      value: `${tag}Controller`,
    });
    Controller('v1')(DomainController);
    for (const op of operations.filter(op => op.tags[0] === tag)) {
      const descriptor = {
        value: function (req: Request, res: Response) {
          return runtime.handle(op, req, res);
        },
        writable: true,
        configurable: true,
      };
      Object.defineProperty(
        DomainController.prototype,
        op.operationId,
        descriptor,
      );
      const decorators: any = {
        get: Get,
        post: Post,
        put: Put,
        patch: Patch,
        delete: Delete,
      };
      decorators[op.method](
        op.route.replace(/^\//, '').replace(/\{([^}]+)\}/g, ':$1'),
      )(DomainController.prototype, op.operationId, descriptor);
      Req()(DomainController.prototype, op.operationId, 0);
      Res()(DomainController.prototype, op.operationId, 1);
    }
    controllers.push(DomainController);
  }
  class AppModule {}
  Module({ controllers })(AppModule);
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: runtime.c.config.env === 'test' ? false : ['warn', 'error'],
  });
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  server.use(helmet());
  mountMedia(server, runtime.c);
  server.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  if (runtime.c.config.env !== 'production') {
    server.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup({
        ...contract,
        servers: [{ url: runtime.c.config.origin + '/v1' }],
      }),
    );
    server.get('/openapi.json', (_req: Request, res: Response) =>
      res.json(contract),
    );
  }
  mountAccountPages(server, runtime.c);
  server.get('/billing/return', (_req: Request, res: Response) =>
    res
      .type('html')
      .send(
        '<h1>SALFORD</h1><p>Return to the app to check your verified subscription status. This page does not confirm payment.</p>',
      ),
  );
  if (process.env.CORS_ORIGINS)
    app.enableCors({
      origin: process.env.CORS_ORIGINS.split(','),
      credentials: false,
    });
  server.use((err: any, _req: Request, res: Response, _next: any) => {
    if (err)
      res.status(err.type === 'entity.too.large' ? 413 : 400).json({
        error: {
          code: 'INVALID_REQUEST_BODY',
          message: 'Invalid request body',
          requestId: uid(),
        },
      });
  });
  await app.init();
  return app;
}
