// Tailwind CSS 로컬 빌드 (오프라인 실행용). 게임 코드에서 쓰는 클래스만 뽑아 css/tailwind.css 생성
// 실행: node tools/build-css.mjs  (tailwindcss v4 패키지 필요 — Claude 작업 환경엔 있음, PC엔 없어도 게임 실행엔 지장 없음)
// ※ 새 Tailwind 클래스를 코드에 추가했으면 다시 빌드해야 화면에 적용됨
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TW_DIR = process.env.TW_DIR || '/opt/npm-tools/node_modules/tailwindcss';
const { compile } = await import(join(TW_DIR, 'dist/lib.mjs'));

const files = ['index.html'];
const walk = (d) => readdirSync(join(ROOT, d)).forEach((f) => {
  const p = join(d, f);
  if (statSync(join(ROOT, p)).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
});
walk('js');

const candidates = new Set();
for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  for (const t of src.split(/[\s"'`{}<>=;,()]+/)) if (t && t.length < 80) candidates.add(t);
}

const input = `@import "tailwindcss";
/* v3 호환: 테두리 기본색 (v4 기본은 currentColor) */
@layer base {
  *, ::after, ::before, ::backdrop, ::file-selector-button { border-color: var(--color-gray-200, currentcolor); }
  button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
}`;

const compiler = await compile(input, {
  base: ROOT,
  loadStylesheet: async (id, base) => {
    const path = id === 'tailwindcss' ? join(TW_DIR, 'index.css') : resolve(id.startsWith('.') ? base : TW_DIR, id.replace(/^tailwindcss\//, ''));
    return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
  }
});
const css = compiler.build([...candidates]);
writeFileSync(join(ROOT, 'css/tailwind.css'), `/* 자동 생성 파일 — 직접 수정 금지. tools/build-css.mjs 로 재생성 */\n${css}`);
console.log('css/tailwind.css', css.length, 'bytes,', candidates.size, 'candidates');
