import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

if (scripts.length === 0) throw new Error('site/index.html contains no inline script');
if (/\binnerHTML\b/.test(scripts.join('\n'))) {
  throw new Error('Unsafe innerHTML assignment found in site script; use textContent/DOM nodes');
}

for (const [index, source] of scripts.entries()) {
  new Script(source, { filename: `site-inline-${index + 1}.js` });
}

console.log(`site script check OK (${scripts.length} inline script${scripts.length === 1 ? '' : 's'})`);
