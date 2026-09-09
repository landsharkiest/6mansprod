import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
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

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1); // behind nginx / ALB in production
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(helmet());
  app.use(
    cors({
      origin: [...config.WEB_ORIGIN],
      credentials: true,
      methods: ['GET', 'POST', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      name: 'sixmansdle.sid',
      store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
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

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'database unreachable' });
    }
  });

  const uploadLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

  app.use('/api/auth', authRouter);
  app.use('/api', gameRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/me', meRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/uploads', uploadLimiter, uploadsRouter);
  app.use('/api/admin', adminRouter);

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
