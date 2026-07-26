#!/usr/bin/env node
/**
 * PreToolUse-хук: жёсткий гейт "Security review перед вливанием в рабочую ветку".
 *
 * Перехватывает команды Bash/PowerShell, которые вливают код в develop/main:
 *   - gh pr create
 *   - git merge (находясь на develop/main)
 *   - git push в develop/main (явно указана ветка или текущая ветка = develop/main)
 *
 * Исключения (аудит не требуется, гейт пропускает):
 *   1. Doc-only — весь дифф (<base>...HEAD) это документация/текст.
 *   2. Rebind — каждый НЕ-doc файл дифа побайтово совпадает с версией, которая
 *      уже была аудирована ранее (см. .gates/security-*.files ниже). Типичный
 *      случай: аудит прошёл по working tree, затем тот же код закоммитили без
 *      правок — повторный ручной аудит не нужен, достаточно сверить хеши.
 *      Пользователем явно подтверждено: ребайнд по идентичности содержимого
 *      (git hash-object), а не по принадлежности предку с маркером — т.е.
 *      действует "через ветки", пока байты файла не менялись.
 *      Доверие к самим сайдкарам `.gates/*.files` держится на том, что
 *      `.gates/**` добавлен в чувствительный денай-лист `scripts/security-gate.js`
 *      (аудит H1) — значит любой diff, создающий/меняющий сайдкар, обязан
 *      пройти РУЧНОЙ `/security-audit`, а не может быть само-одобрен авто-гейтом.
 *      Без этого правила диф мог бы вписать себе фиктивную запись
 *      `<путь-к-чувствительному-файлу>\t<нужный-хеш>` и авто-гейт создал бы
 *      маркер, легитимизируя фиктивный ребайнд для будущих коммитов.
 * Если хоть один изменённый не-doc файл не покрыт ни одним из исключений —
 * гейт требует .gates/security-<short-HEAD>.ok (создаёт security-auditor или
 * scripts/security-gate.js после PASS).
 *
 * Прочие команды пропускает мгновенно (exit 0). При внутренней ошибке на
 * НЕгейтовой команде — тоже пропускает (fail-open), чтобы не ломать workflow.
 * НО: если для гейтовой команды не удалось вычислить дифф — fail-safe:
 * исключения НЕ применяются, проверяется только точный маркер (по умолчанию блок).
 */
'use strict';

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Для аргументов, содержащих данные из репозитория (имена файлов из дифа и
// т.п.) — БЕЗ shell, чтобы имя файла вида `$(rm -rf ~)` не исполнялось
// (execSync выше идёт через шелл и уязвим к этому; execFileSync — нет).
function gitFile(argv) {
  return execFileSync('git', argv, { stdio: ['ignore', 'pipe', 'ignore'] })
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

// --- Текст для детекции "это гейтовая команда?" — БЕЗ содержимого сообщений ---
// commit message / PR title-body часто содержат слова "merge"/"push"/"git" как
// обычный текст (напр. "docs: fix pre-merge race"), а не как саму git-команду.
// Без этой зачистки такой текст ложно триггерит гейт (проверено на практике).
// ВАЖНО: зачищаем ТОЛЬКО контент за флагами свободного текста (-m/--message/
// --title/--body/--notes) и heredoc-тела — а не вообще все кавычки в команде.
// Бланкетная зачистка всех кавычек (прошлая версия) занижала детекцию: она же
// стирала `git push origin "develop"`, из-за чего гейт мог не сработать на
// реальном push в рабочую ветку — найдено аудитом (M).
function sanitizeForDetection(raw) {
  let s = raw;
  // heredoc-тела (git commit -m "$(cat <<'EOF' ... EOF)") — убираем целиком.
  s = s.replace(/<<[-~]?\s*(['"]?)([A-Za-z_]\w*)\1[\s\S]*?\n\s*\2\b/g, ' ');
  // содержимое кавычек ТОЛЬКО сразу после флагов свободного текста.
  const FREE_TEXT_FLAG = /(-m|--message|--title|--body|--notes)(\s*[=\s]\s*)/;
  s = s.replace(
    new RegExp(FREE_TEXT_FLAG.source + '"(?:[^"\\\\]|\\\\.)*"', 'g'),
    '$1$2""'
  );
  s = s.replace(
    new RegExp(FREE_TEXT_FLAG.source + "'(?:[^'\\\\]|\\\\.)*'", 'g'),
    "$1$2''"
  );
  return s;
}

const detect = sanitizeForDetection(cmd);

// --- Является ли команда вливанием в рабочую ветку? ---
const isPrCreate = /\bgh\b[\s\S]*\bpr\b[\s\S]*\bcreate\b/.test(detect);
const isMerge = /\bgit\b[\s\S]*\bmerge\b/.test(detect);
const isPush = /\bgit\b[\s\S]*\bpush\b/.test(detect);
const mentionsWorkBranch = /\b(develop|main|master)\b/.test(detect);

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

// Если в ТОЙ ЖЕ команде раньше стоит `git checkout/switch <ref>`, то к моменту
// фактического push/merge текущая ветка будет уже другой — live HEAD на момент
// проверки хука это ещё не отражает (checkout из этой же цепочки ещё не выполнился).
// Берём последний упомянутый checkout/switch-таргет вместо live HEAD.
function effectiveBranch() {
  const matches = [...cmd.matchAll(/\bgit\s+(?:checkout|switch)\b(?:\s+-[bB])?\s+([^\s&|;]+)/g)];
  if (matches.length > 0) {
    const target = matches[matches.length - 1][1];
    if (target && target !== '-') return target;
  }
  return branch();
}

const onWorkBranch = () => /^(develop|main|master)$/.test(effectiveBranch());

let gated = false;
if (isPrCreate) gated = true;
else if (isMerge && onWorkBranch()) gated = true;
else if (isPush && (mentionsWorkBranch || onWorkBranch())) gated = true;

if (!gated) allow();

// --- Doc-only набор расширений/имён — не несут исполняемого кода/конфигурации ---
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
// Возвращает null, если дифф вычислить не удалось (→ fail-safe, исключения не применяем).
function changedFiles() {
  // base приходит из --base/-B команды (текст, который сформировал агент) —
  // не доверяем ему как части shell-строки, гоним через execFileSync (H2).
  const base = targetBase();
  for (const ref of [`origin/${base}`, base]) {
    try {
      // Без ^{commit}: на Windows execSync/спавн шёл через cmd.exe, где ^ —
      // экранирующий символ и `ref^{commit}` ломался. Для проверки
      // существования ref достаточно --verify --quiet.
      gitFile(['rev-parse', '--verify', '--quiet', ref]);
    } catch {
      continue; // такого ref нет — пробуем следующий
    }
    try {
      const out = gitFile(['diff', '--name-only', `${ref}...HEAD`]);
      return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    } catch {
      return null; // ref есть, но diff упал — не рискуем
    }
  }
  return null; // ни origin/base, ни base не нашли
}

// --- Rebind: читаем все .gates/security-*.files (путь -> git-hash содержимого) ---
// Формат сайдкара: строки "<путь>\t<git hash-object содержимого>". Пишут его
// security-auditor (Режим 2) и scripts/security-gate.js после успешной проверки.
function loadAuditedHashes() {
  const dir = '.gates';
  const map = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return map;
  }
  for (const f of entries) {
    if (!/^security-.+\.files$/.test(f)) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(dir, f), 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const p = line.slice(0, tab).trim();
      const hash = line.slice(tab + 1).trim();
      if (p && hash && !map.has(p)) map.set(p, hash);
    }
  }
  return map;
}

function isAuditedUnchanged(file, auditedHashes) {
  if (!auditedHashes.has(file)) return false;
  let currentHash;
  try {
    // gitFile — без shell: `file` пришёл из `git diff --name-only` и может
    // быть управляем содержимым чужой ветки/коммита (аудит H2).
    currentHash = gitFile(['rev-parse', `HEAD:${file}`]);
  } catch {
    return false; // файла нет на HEAD (переименован/удалён/не закоммичен) — не рискуем
  }
  return currentHash === auditedHashes.get(file);
}

const files = changedFiles();

if (files && files.length > 0) {
  const auditedHashes = loadAuditedHashes();
  const stillNeedsAudit = files.filter(
    (f) => !isDocFile(f) && !isAuditedUnchanged(f, auditedHashes)
  );
  if (stillNeedsAudit.length === 0) {
    process.stderr.write(
      `🟢 Security gate: весь дифф (${files.length} файл(ов)) — либо документация, ` +
        `либо уже аудированный код без изменений содержимого (rebind). Аудит не требуется.\n`
    );
    allow();
  }
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

const marker = `.gates/security-${head}.ok`;
if (fs.existsSync(marker)) {
  allow();
}

block(
  `⛔ Security review НЕ пройден для коммита ${head}.\n` +
    `Вливание в рабочую ветку заблокировано (строгий гейт).\n` +
    `Запусти /security-audit (или, для некритичных изменений без чувствительных путей, ` +
    `node scripts/security-gate.js) — после PASS появится ${marker}, ` +
    `и это действие разблокируется. Новый коммит с реально новым содержимым → нужен новый аудит.`
);
