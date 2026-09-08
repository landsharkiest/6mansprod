import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { config } from '../config.js';
import { findUserById, upsertDiscordUser, type UserRow } from './users.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Passport attaches the deserialised row to req.user.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends UserRow {}
  }
}

export function configurePassport(): void {
  if (config.discordEnabled) {
    passport.use(
      new DiscordStrategy(
        {
          clientID: config.DISCORD_CLIENT_ID,
          clientSecret: config.DISCORD_CLIENT_SECRET,
          callbackURL: `${config.API_ORIGIN}/api/auth/discord/callback`,
          scope: ['identify'],
        },
        (_access, _refresh, profile, done) => {
          upsertDiscordUser({
            id: profile.id,
            username: profile.username,
            global_name: (profile as { global_name?: string | null }).global_name,
            avatar: profile.avatar,
          })
            .then((user) => done(null, user))
            .catch((err) => done(err));
        },
      ),
    );
  }

  // Only the numeric id goes into the session; the row is reloaded per request.
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id: number, done) => {
    findUserById(id)
      .then((user) => done(null, user ?? false))
      .catch((err) => done(err));
  });
}

export { passport };
