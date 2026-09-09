import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import pinoHttp, { stdSerializers } from 'pino-http';
import { ZodError } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db/pool.js';
import { configurePassport, passport } from './auth/passport.js';
import { HttpError } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { gameRouter } from './routes/game.js';
import { statsRouter } from './routes/stats.js';
import { meRouter, usersRouter } from './routes/me.js';
import { uploadsRouter } from './routes/uploads.js';
import { adminRouter } from './routes/admin.js';
import { challengesRouter } from './routes/challenges.js';
import { blitzRouter } from './routes/blitz.js';
import { botRouter } from './routes/bot.js';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1); // behind nginx / ALB in production
  app.disable('x-powered-by');
  // ETags are for conditional GETs against static/slow-changing bodies; nearly everything here is
  // either per-session or DB-fresh on every request, so the weak-etag hashing is pure overhead.
  app.set('etag', false);

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      // Quiet by default; only surface client/server errors at a level that pages someone.
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // req.user is populated by passport upstream of this middleware, and the log line itself
      // is written lazily on response finish, so it's already set by the time this runs.
      customProps: (req) => ({ userId: (req as unknown as { user?: { id: number } }).user?.id }),
      serializers: {
        // The session cookie is a bearer credential; never let it reach log storage. Note:
        // pino's stdSerializers.req returns `headers` as the SAME object reference as
        // `req.headers` (not a copy), and autoLogging serializes the request as soon as it
        // arrives — before express-session has parsed the cookie header. Mutating that shared
        // object here would corrupt the cookie session middleware reads a few lines down, so
        // build a fresh headers object instead of writing into the one we were handed.
        req(req) {
          const out = stdSerializers.req(req);
          if (out.headers?.cookie) out.headers = { ...out.headers, cookie: '[redacted]' };
          return out;
        },
      },
    }),
  );
  app.use(
    helmet({
      // The API only ever returns JSON, never renders HTML, so a Content-Security-Policy (which
      // governs script/style/frame sources for rendered pages) is meaningless here and would
      // just be more to maintain in step with the web app. HSTS still matters — it's what tells
      // browsers to keep using https for this origin — so keep it on explicitly.
      contentSecurityPolicy: false,
      hsts: { maxAge: 180 * 24 * 60 * 60, includeSubDomains: true },
    }),
  );
  app.use(
    cors({
      origin: [...config.WEB_ORIGIN],
      credentials: true,
      // OPTIONS is handled by the cors middleware itself (it short-circuits preflight requests
      // before they reach any route), so it doesn't need to be listed here.
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  // Coarse anonymous-traffic throttle: 600 requests / 10 min per IP. This is a backstop against
  // scraping/abuse across the whole API, well above any real user's usage, and layered under the
  // tighter per-route limiters (guesses, reports, uploads) that already exist below. /api/health
  // is excluded because it's polled frequently by infra (load balancer / uptime checks) and
  // carries no sensitive data or DB write cost worth throttling.
  app.use(
    rateLimit({
      windowMs: 10 * 60_000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/api/health',
    }),
  );

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      name: 'sixmansdle.sid',
      store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      // Rolling: an active player's cookie keeps sliding forward instead of hard-expiring 30
      // days after login, so "sane maxAge" here really means "sane idle timeout". A dormant
      // session still dies 30 days after its last request.
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: config.isProd ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  // Safe-by-default cache policy: nothing here should sit in a shared/browser cache since most
  // responses are session-scoped (session cookie determines the body). Routes that are genuinely
  // public and fine to cache briefly (leaderboard, community stats) override this themselves.
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  app.get('/api/version', (_req, res) => {
    // Set by infra/deploy.sh at release time; absent in dev, and harmless if missing.
    res.json({ sha: config.GIT_SHA ?? null });
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'database unreachable' });
    }
  });

  const uploadLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
  // Server-to-server, not per-browser-session, so this is generous compared to uploadLimiter —
  // it's a backstop against a misbehaving bot process, not real per-user throttling.
  const botLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });

  app.use('/api/auth', authRouter);
  app.use('/api', gameRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/me', meRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/uploads', uploadLimiter, uploadsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/challenges', challengesRouter);
  app.use('/api/blitz', blitzRouter);
  app.use('/api/bot', botLimiter, botRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.flatten() });
      return;
    }
    req.log.error({ err }, 'unhandled error');
    res.status(500).json({ error: config.isProd ? 'Internal server error' : String(err?.message ?? err) });
  };
  app.use(errorHandler);

  return app;
}
