/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

import type { SessionUser } from './lib/types';

declare global {
  // Safety net: most secrets are also typed from .dev.vars into the generated
  // worker-configuration.d.ts, but these live only in .dev.vars/secrets, so
  // declare them here to keep `env.*` typed on a fresh clone.
  namespace Cloudflare {
    interface Env {
      RESEND_API_KEY: string;
      RESEND_WEBHOOK_SECRET: string;
      TURSO_DATABASE_URL: string;
      TURSO_AUTH_TOKEN: string;
      SESSION_SECRET: string;
      MAILEROO_API_KEY?: string;
      MAILEROO_WEBHOOK_SECRET?: string;
    }
  }

  namespace App {
    interface Locals {
      user: SessionUser | null;
    }
  }
}

export {};
