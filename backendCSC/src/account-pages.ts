import type { Express, Request, Response } from 'express';
import express from 'express';
import { type Context, ApiError, limit, uid } from './core.js';
import { authHandlers } from './auth.js';
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    s =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        s
      ]!),
  );
const page = (body: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SALFORD account</title><body><main><h1>SALFORD</h1>${body}</main></body></html>`;
export function mountAccountPages(app: Express, c: Context) {
  app.get('/auth/action', (req: Request, res: Response) => {
    const token = String(req.query.token || ''),
      purpose = String(req.query.purpose || '');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (
      !/^[\w-]{40,100}$/.test(token) ||
      !['verify_email', 'change_email', 'reset_password'].includes(purpose)
    ) {
      res.status(400).type('html').send(page('<p>Invalid account link.</p>'));
      return;
    }
    const reset = purpose === 'reset_password';
    res
      .type('html')
      .send(
        page(
          `<h2>${
            reset ? 'Reset password' : 'Verify email'
          }</h2><form method="post" action="/auth/action"><input type="hidden" name="token" value="${escape(
            token,
          )}"><input type="hidden" name="purpose" value="${escape(purpose)}">${
            reset
              ? '<p><label>New password <input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label></p><p><label>Confirm password <input name="confirm" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label></p>'
              : ''
          }<button type="submit">${
            reset ? 'Reset password' : 'Confirm email'
          }</button></form><p>If you did not request this action, close this page.</p>`,
        ),
      );
  });
  app.post(
    '/auth/action',
    express.urlencoded({ extended: false, limit: '4kb' }),
    async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      try {
        await limit(c, `account-page:${req.ip}`, 10, 60);
        const b = req.body || {};
        if (
          !/^[\w-]{40,100}$/.test(b.token) ||
          !['verify_email', 'change_email', 'reset_password'].includes(
            b.purpose,
          )
        )
          throw new ApiError(400, 'INVALID_LINK');
        const reset = b.purpose === 'reset_password';
        if (
          reset &&
          (typeof b.password !== 'string' ||
            b.password.length < 12 ||
            b.password.length > 128 ||
            b.password !== b.confirm)
        )
          throw new ApiError(422, 'PASSWORD_VALIDATION');
        const input: any = {
          body: reset
            ? { token: b.token, newPassword: b.password }
            : { token: b.token },
          params: {},
          query: {},
          headers: {},
          requestId: uid(),
          ip: req.ip,
        };
        await authHandlers(c)[reset ? 'resetPassword' : 'verifyEmail'](input);
        res
          .type('html')
          .send(
            page(
              '<h2>Done</h2><p>Your account action is complete. Return to the mobile app and sign in.</p>',
            ),
          );
      } catch (e) {
        res
          .status(e instanceof ApiError ? e.status : 400)
          .type('html')
          .send(
            page(
              '<p>This link is invalid, expired, or the passwords do not match. Request a new link or check your password and try again.</p>',
            ),
          );
      }
    },
  );
}
