// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  // We use our own signed session cookie auth (see src/lib/auth.ts), so we do
  // not need the adapter-provisioned Workers KV namespace for Astro Sessions.
  session: false,
  server: { port: 8787 },
  vite: {
    plugins: [tailwindcss()],
  },
});
