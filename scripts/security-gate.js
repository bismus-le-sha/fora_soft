#!/usr/bin/env node
/**
 * Авто-гейт перед мержем эпика в main: заменяет ручной /security-audit там,
 * где это безопасно. Хук .claude/hooks/pre-merge-gate.js блокирует только
 * merge/push/PR в main/master (границу эпика/релиза) — обычные PR задач
 * фичи в develop этим скриптом проверять не нужно, он не обязателен для них.
 *
 * Если дифф до main не трогает ничего из SENSITIVE_PATH_RES, прогоняет
 * test/lint/npm-audit и, при зелёном результате, сам проставляет
 * .gates/security-<HEAD>.ok и .gates/security-<HEAD>.files (хеши для
 * последующего rebind — см. .claude/hooks/pre-merge-gate.js). Если хоть
 * один изменённый файл чувствительный — скрипт НИЧЕГО не создаёт и требует
 * ручной /security-audit.
 *
 * Использование: node scripts/security-gate.js
 * Код выхода: 0 — гейт открыт (маркеры созданы), 1 — нужен ручной аудит
 * или проверки упали.
 */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Без shell везде — имена файлов/ref идут из `git diff`/аргументов команды и
// не должны интерполироваться в shell-строку (аудит H2: command injection
// через имя файла вида `$(...)` в чужой ветке).
function git(argv) {
  return execFileSync('git', argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

// --- Чувствительные пути: узкий список по-настоящему критичного ---
// Сужено намеренно (было: почти любой .yaml/.sh/Makefile/config.js попадал
// сюда, из-за чего авто-гейт был бесполезен — почти каждый PR требовал
// ручного аудита). Теперь только то, что реально касается секретов,
// authN/authZ, сокет-слоя, CI и доверия самого гейта.
const SENSITIVE_PATH_RES = [
  /^\.claude\//,
  // .gates/** ЯВНО чувствительный (аудит H1): это сами файлы доверия гейта
  // (.ok/.files-сайдкары для rebind в pre-merge-gate.js). Если бы авто-гейт
  // мог сам одобрить diff, создающий/меняющий .gates/*.files, дифф мог бы
  // вписать фиктивную запись "<чувствительный-файл>\t<нужный-хеш>" и
  // легитимизировать себе rebind без реального аудита.
  /^\.gates\//,
  /^\.github\/workflows\//,
  /^security\//,
  /(^|\/)\.env/,
  /^app\/server\/src\/socket\//,
];
// Ключевые слова в пути — файлы про authN/authZ/секреты/rate-limit по имени,
// даже вне явно перечисленных выше директорий.
const SENSITIVE_KEYWORD_RE = /auth|token|session|crypto|rate-?limit/i;

function isSensitive(file) {
  return SENSITIVE_PATH_RES.some((re) => re.test(file)) || SENSITIVE_KEYWORD_RE.test(file);
}

function currentBranch() {
  try {
    return git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return '';
  }
}

function targetBase() {
  const b = currentBranch();
  if (/^(main|master)$/.test(b)) return b;
  return 'main';
}

function changedFiles() {
  const base = targetBase();
  for (const ref of [`origin/${base}`, base]) {
    try {
      git(['rev-parse', '--verify', '--quiet', ref]);
    } catch {
      continue;
    }
    const out = git(['diff', '--name-only', `${ref}...HEAD`]);
    return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  }
  return null;
}

function fail(msg) {
  console.error(`⛔ ${msg}`);
  process.exit(1);
}

function run(cmdLine) {
  console.log(`\n$ ${cmdLine}`);
  const [cmd, ...args] = cmdLine.split(' ');
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  return res.status === 0;
}

const files = changedFiles();
if (files === null) {
  fail(
    'Не удалось вычислить дифф до базовой ветки (нет origin/develop и develop?). ' +
      'Запусти /security-audit вручную.'
  );
}
if (files.length === 0) {
  console.log('Дифф пуст — нечего гейтовать.');
  process.exit(0);
}

const sensitive = files.filter(isSensitive);
if (sensitive.length > 0) {
  fail(
    `Дифф трогает чувствительные пути — авто-гейт не применим, нужен ручной /security-audit:\n` +
      sensitive.map((f) => `  - ${f}`).join('\n')
  );
}

console.log(`Не-чувствительный дифф (${files.length} файл(ов)) — прогоняю автоматические проверки...`);

const ok =
  run('npm test --workspaces --if-present') &&
  run('npm run lint --workspaces --if-present') &&
  run('npm audit --omit=dev --audit-level=high');

if (!ok) {
  fail('Одна из проверок (test/lint/audit) упала — гейт остаётся закрытым. Почини и перезапусти.');
}

let head;
try {
  head = git(['rev-parse', '--short', 'HEAD']);
} catch {
  fail('Не удалось определить HEAD.');
}

fs.mkdirSync('.gates', { recursive: true });
fs.writeFileSync(path.join('.gates', `security-${head}.ok`), '');

const lines = [];
for (const f of files) {
  try {
    const hash = git(['rev-parse', `HEAD:${f}`]);
    lines.push(`${f}\t${hash}`);
  } catch {
    // файла нет на HEAD (удалён) — пропускаем, для rebind он не нужен
  }
}
fs.writeFileSync(path.join('.gates', `security-${head}.files`), lines.join('\n') + '\n');

console.log(
  `\n🟢 Авто-гейт пройден для ${head}. Создано .gates/security-${head}.ok и .files (для rebind). ` +
    `PR/push теперь разблокированы.`
);
process.exit(0);
