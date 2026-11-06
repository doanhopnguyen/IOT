import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const target = new URL(
  '../smart-access-control-backend/src/main/resources/static/admin/',
  import.meta.url,
);
await mkdir(target, { recursive: true });
await build({
  entryPoints: [new URL('src/app.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: new URL('app.js', target).pathname.replace(/^\/(\w:)/, '$1'),
});
for (const file of ['index.html', 'style.css'])
  await copyFile(new URL(`src/${file}`, import.meta.url), new URL(file, target));
await mkdir(new URL('assets/', target), { recursive: true });
await copyFile(
  new URL('src/assets/smart-door-login-hero.webp', import.meta.url),
  new URL('assets/smart-door-login-hero.webp', target),
);
console.log('Admin built into Spring Boot /admin/index.html');
