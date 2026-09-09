import { Router } from 'express';
import type { MeResponse } from '@6mansdle/shared';
import { config } from '../config.js';
import { passport } from '../auth/passport.js';
import { toPublicUser, upsertDiscordUser } from '../auth/users.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';

export const authRouter = Router();

authRouter.get('/discord', (req, res, next) => {
  if (!config.discordEnabled) return next(new HttpError(503, 'Discord login is not configured'));
  passport.authenticate('discord')(req, res, next);
});

authRouter.get(
  '/discord/callback',
  passport.authenticate('discord', { failureRedirect: `${config.WEB_ORIGIN[0]}/?login=failed` }),
  (_req, res) => {
    res.redirect(`${config.WEB_ORIGIN[0]}/?login=ok`);
  },
);

/**
 * Development-only login that skips Discord. Disabled in production and whenever Discord is configured,
 * so it can never coexist with real accounts.
 */
if (!config.isProd && !config.discordEnabled) {
  authRouter.get('/dev-login', (req, res, next) => {
    const as = req.query.as === 'admin' ? 'admin' : 'player';
    upsertDiscordUser({
      id: as === 'admin' ? 'dev-admin' : 'dev-player',
      username: as === 'admin' ? 'Dev Admin' : 'Dev Player',
      avatar: null,
    })
      .then(async (user) => {
        if (as === 'admin') {
          await pool.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [user.id]);
          user.is_admin = true;
        }
        req.login(user, (err) => (err ? next(err) : res.redirect(`${config.WEB_ORIGIN[0]}/?login=ok`)));
      })
      .catch(next);
  });
}

authRouter.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('sixmansdle.sid');
      res.status(204).end();
    });
  });
});

authRouter.get('/me', (req, res) => {
  const body: MeResponse = { user: req.user ? toPublicUser(req.user) : null };
  res.json(body);
});
