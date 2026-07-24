#!/usr/bin/env node
/**
 * PreToolUse-хук: жёсткий гейт "Security review перед вливанием в рабочую ветку".
 *
 * Перехватывает команды Bash/PowerShell, которые вливают код в develop/main:
 *   - gh pr create
 *   - git merge (находясь на develop/main)
 *   - git push в develop/main (явно указана ветка или текущая ветка = develop/main)
 *
 * Исключение (doc-only): если ВСЁ, что вливается (дифф <base>...HEAD), —
 * документация/текст (.md, .mdc, .txt, LICENSE, .gitignore и т.п.), security-аудит
 * НЕ требуется и действие пропускается. Стоит хоть один файл кода/конфига/
 * зависимостей (.js, .ts, .json, .yml, Dockerfile, lock-файлы …) — гейт включается.
 * Исключение контентное, а не по намерению: код-«фиксы» тоже аудируются.
 *
 * Разрешает действие ТОЛЬКО если для текущего HEAD есть security-подпись:
 *   .gates/security-<short-HEAD>.ok  (создаёт security-auditor после PASS).
 * Иначе блокирует (exit 2) и напоминает запустить /security-audit.
 *
 * Прочие команды пропускает мгновенно (exit 0). При внутренней ошибке на
 * НЕгейтовой команде — тоже пропускает (fail-open), чтобы не ломать workflow.
 * НО: если для гейтовой команды не удалось вычислить дифф — fail-safe:
 * doc-only исключение НЕ применяется, проверяется маркер (по умолчанию блок).
 */
'use strict';

const { execSync } = require('child_process');

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function git(args) {
  return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

function block(reason) {
  process.stderr.write(reason + '\n');
  process.exit(2); // 2 = блокировать инструмент, stderr уходит агенту
}

function allow() {
  process.exit(0);
}

let input = {};
try {
  input = JSON.parse(readStdin() || '{}');
} catch {
  allow();
}

const cmd = String(input?.tool_input?.command || '');
if (!cmd.trim()) allow();

// --- Является ли команда вливанием в рабочую ветку? ---
const isPrCreate = /\bgh\b[\s\S]*\bpr\b[\s\S]*\bcreate\b/.test(cmd);
const isMerge = /\bgit\b[\s\S]*\bmerge\b/.test(cmd);
const isPush = /\bgit\b[\s\S]*\bpush\b/.test(cmd);
const mentionsWorkBranch = /\b(develop|main|master)\b/.test(cmd);

let currentBranch = '';
function branch() {
  if (!currentBranch) {
    try {
      currentBranch = git('rev-parse --abbrev-ref HEAD');
    } catch {
      currentBranch = '';
    }
  }
  return currentBranch;
}

const onWorkBranch = () => /^(develop|main|master)$/.test(branch());

let gated = false;
if (isPrCreate) gated = true;
else if (isMerge && onWorkBranch()) gated = true;
else if (isPush && (mentionsWorkBranch || onWorkBranch())) gated = true;

if (!gated) allow();

// --- Doc-only исключение: аудит не нужен, если вливается только документация ---
// Расширения/имена, которые не несут исполняемого кода/конфигурации/зависимостей.
// Намеренно узко: только markdown. `.txt` НЕ включён — он используется как манифест
// зависимостей (requirements.txt/runtime.txt) и может маскировать переименованный
// код/секрет, а такие изменения обязаны проходить аудит (аудит M1).
const SAFE_EXT = new Set(['.md', '.mdc', '.markdown']);
const SAFE_BASENAMES = new Set([
  'LICENSE',
  'NOTICE',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
]);

function isDocFile(file) {
  const base = file.split('/').pop();
  if (SAFE_BASENAMES.has(base)) return true;
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : '';
  return SAFE_EXT.has(ext);
}

// База сравнения: явный --base/-B ТОЛЬКО у `gh pr create` (у push/merge такого флага
// нет, и его парсинг из произвольной строки отвязал бы базу от реального таргета — аудит M2).
function targetBase() {
  if (isPrCreate) {
    const m = cmd.match(/(?:--base|-B)[=\s]+([^\s]+)/);
    if (m) return m[1];
  }
  if (/^(main|master)$/.test(branch())) return branch();
  return 'develop';
}

// Список изменённых файлов относительно базы (merge-base, three-dot).
// Возвращает null, если дифф вычислить не удалось (→ fail-safe, исключение не применяем).
function changedFiles() {
  const base = targetBase();
  for (const ref of [`origin/${base}`, base]) {
    try {
      // Без ^{commit}: execSync на Windows идёт через cmd.exe, где ^ — символ
      // экранирования и `ref^{commit}` ломается. Для проверки существования
      // ref достаточно --verify --quiet.
      git(`rev-parse --verify --quiet ${ref}`);
    } catch {
      continue; // такого ref нет — пробуем следующий
    }
    try {
      const out = git(`diff --name-only ${ref}...HEAD`);
      return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    } catch {
      return null; // ref есть, но diff упал — не рискуем
    }
  }
  return null; // ни origin/base, ни base не нашли
}

const files = changedFiles();
if (files && files.length > 0 && files.every(isDocFile)) {
  process.stderr.write(
    `🟢 Security gate: вливаются только документация/текст (${files.length} файл(ов)) — ` +
      `security-аудит не требуется.\n`
  );
  allow();
}

// --- Гейтовая команда: проверяем security-подпись для текущего HEAD ---
let head = '';
try {
  head = git('rev-parse --short HEAD');
} catch {
  block(
    '⛔ Security gate: не удалось определить HEAD (нет коммитов?). ' +
      'Сначала закоммить изменения и запусти /security-audit.'
  );
}

const fs = require('fs');
const marker = `.gates/security-${head}.ok`;
if (fs.existsSync(marker)) {
  allow();
}

block(
  `⛔ Security review НЕ пройден для коммита ${head}.\n` +
    `Вливание в рабочую ветку заблокировано (строгий гейт).\n` +
    `Запусти /security-audit — после PASS security-auditor создаст ${marker}, ` +
    `и это действие разблокируется. Новый коммит → нужен новый аудит.`
);
