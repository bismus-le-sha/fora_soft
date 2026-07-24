#!/usr/bin/env node
/**
 * PreToolUse-хук: жёсткий гейт "Security review перед вливанием в рабочую ветку".
 *
 * Перехватывает команды Bash/PowerShell, которые вливают код в develop/main:
 *   - gh pr create
 *   - git merge (находясь на develop/main)
 *   - git push в develop/main (явно указана ветка или текущая ветка = develop/main)
 *
 * Разрешает действие ТОЛЬКО если для текущего HEAD есть security-подпись:
 *   .gates/security-<short-HEAD>.ok  (создаёт security-auditor после PASS).
 * Иначе блокирует (exit 2) и напоминает запустить /security-audit.
 *
 * Прочие команды пропускает мгновенно (exit 0). При внутренней ошибке на
 * НЕгейтовой команде — тоже пропускает (fail-open), чтобы не ломать workflow.
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
