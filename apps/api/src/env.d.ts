// Type shims for packages without bundled declarations.
declare module 'passport-discord' {
  import type { Strategy as PassportStrategy } from 'passport';
  export interface Profile {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    global_name?: string | null;
    provider: 'discord';
  }
  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
  }
  export type VerifyCallback = (
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: unknown, user?: unknown) => void,
  ) => void;
  export class Strategy implements PassportStrategy {
    constructor(options: StrategyOptions, verify: VerifyCallback);
    name: string;
    authenticate(req: unknown, options?: unknown): void;
  }
}
