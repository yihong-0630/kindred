#!/usr/bin/env node
// Run the Exa harvest from the command line.
//
//   npm run harvest                 every topic, link-checked
//   npm run harvest -- --topic awe-walk --topic weak-ties
//   npm run harvest -- --no-verify  skip the link check (faster, less certain)
//   npm run verify-sources          re-check every stored citation only

import './env.js';
import { join } from 'node:path';
import { envRoot as root } from './env.js';

const { harvest, verifyAllLinks, practiceStats, researchEnabled, TOPICS } = await import('./research.js');
const { seedPractices } = await import('./practices.js');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const values = (name) => args.reduce((acc, a, i) => (a === `--${name}` && args[i + 1] ? [...acc, args[i + 1]] : acc), []);

const added = seedPractices();
if (added) console.log(`· seeded ${added} curated practices first\n`);

if (flag('verify-only')) {
  console.log('Re-checking every stored citation…\n');
  const out = await verifyAllLinks();
  console.log(`  checked ${out.checked} — ${out.ok} live, ${out.blocked} behind a paywall or bot-wall (still valid), ${out.dead} dead, ${out.unknown} unreachable`);
  const s = practiceStats();
  console.log(`  library: ${s.total} practices (${s.curated} curated, ${s.harvested} harvested)\n`);
  process.exit(out.dead > 0 ? 1 : 0);
}

if (!researchEnabled()) {
  console.error(`
  EXA_API_KEY is not set.

  Add it to ${join(root, '.env')}:

      EXA_API_KEY=your-key-here

  Then run this again. Kindred works without it — it falls back to the curated
  evidence set in server/practices.js — but the harvest is what gives every
  recommendation a live, link-checked source.
`);
  process.exit(1);
}

const wanted = values('topic');
const topics = wanted.length ? TOPICS.filter((t) => wanted.includes(t.slug)) : TOPICS;
if (wanted.length && topics.length !== wanted.length) {
  const missing = wanted.filter((w) => !TOPICS.some((t) => t.slug === w));
  console.error(`  unknown topic(s): ${missing.join(', ')}`);
  console.error(`  available: ${TOPICS.map((t) => t.slug).join(', ')}\n`);
  process.exit(1);
}

console.log(`Harvesting ${topics.length} topic${topics.length === 1 ? '' : 's'} via Exa${flag('no-verify') ? '' : ', link-checking each source'}…\n`);

const report = await harvest({
  topics,
  verifyLinks: !flag('no-verify'),
  onProgress: (e) => {
    if (e.error) return console.log(`  ✗ ${e.slug.padEnd(28)} ${e.error}`);
    const { publisher, credibility, link } = e.source;
    console.log(`  ✓ ${e.slug.padEnd(28)} ${publisher} (${credibility}, link ${link})`);
  }
});

const s = report.stats || practiceStats();
console.log(`
  ${report.kept} stored, ${report.failed} failed, ${report.topics.reduce((a, t) => a + t.rejected, 0)} results rejected as off-allowlist.

  library now: ${s.total} practices — ${s.curated} curated, ${s.harvested} harvested, ${s.verified} with a verified link.

  publishers:
${s.publishers.map((p) => `    ${String(p.n).padStart(3)}  ${p.publisher}`).join('\n')}
`);
