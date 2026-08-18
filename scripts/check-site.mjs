import { readFileSync } from 'node:fs';
import ts from 'typescript';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

if (scripts.length === 0) throw new Error('site/index.html contains no inline script');
if (/\binnerHTML\b/.test(scripts.join('\n'))) {
  throw new Error('Unsafe innerHTML assignment found in site script; use textContent/DOM nodes');
}

for (const [index, source] of scripts.entries()) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      allowJs: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
    fileName: `site-inline-${index + 1}.js`,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      errors
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
        .join('\n'),
    );
  }
}

console.log(`site script check OK (${scripts.length} inline script${scripts.length === 1 ? '' : 's'})`);
