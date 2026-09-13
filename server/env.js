// Load .env before anything else reads process.env.
//
// This has to be its own module because ES imports are evaluated before the
// importing module's body runs. Reading .env inside index.js meant PORT and
// KINDRED_SECRET were already resolved — from defaults — by the time the file
// was parsed, so both were silently ignored. Importing this first fixes that
// for every consumer, including the harvest CLI.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    // A real environment variable always wins over the file.
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env, which is a supported way to run Kindred */ }

export const envRoot = root;
