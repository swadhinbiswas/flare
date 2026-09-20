/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

import type { SessionUser } from './lib/types';

// Safety net: these secrets are typed from .dev.vars when present, and the
// generated worker-configuration.d.ts is committed so a fresh clone typechecks
// without .dev.vars. Types must stay `string` to merge cleanly.
declare namespace Cloudflare {
  interface Env {
    RESEND_API_KEY: string;
    RESEND_WEBHOOK_SECRET: string;
    TURSO_DATABASE_URL: string;
    TURSO_AUTH_TOKEN: string;
    SESSION_SECRET: string;
  }
}

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
    }
  }
}

export {};
