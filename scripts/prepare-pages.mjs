import { cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
rmSync('docs', { recursive: true, force: true });
mkdirSync('docs', { recursive: true });
cpSync('dist', 'docs', { recursive: true });
rmSync('docs/_headers', { force: true });
writeFileSync('docs/.nojekyll', '');
