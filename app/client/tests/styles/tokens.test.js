import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Задача 34 — Фундамент: design-токены и шрифты.
 *
 * Не критично (обычная приёмка «код + тесты зелёные», без гейта test-first).
 * jsdom/RTL не умеют проверять вычисленный CSS, поэтому тест — на структуру
 * файла: все токены из design-handoff/README.md → "Design Tokens" должны
 * присутствовать как CSS custom properties с теми же именами (задачи 35–44
 * зависят от этих имён — регрессия здесь ломает весь план области 10).
 */

const tokensCssPath = resolve(process.cwd(), 'src/styles/tokens.css');
const css = readFileSync(tokensCssPath, 'utf-8');

const expectedColorTokens = [
  '--ink',
  '--ink-soft',
  '--body',
  '--muted',
  '--muted-2',
  '--faint',
  '--faint-2',
  '--bg',
  '--bg-canvas',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--chip',
  '--line',
  '--line-2',
  '--dots',
  '--dash',
  '--accent',
  '--accent-ink',
  '--accent-bg',
  '--warn-bg',
  '--warn-border',
  '--warn-text',
  '--ok',
  '--ok-bright',
  '--silhouette',
  '--silhouette-2',
  '--on-dark',
  '--scrim',
];

const expectedSpaceTokens = [4, 6, 8, 10, 12, 14, 18, 20, 24, 26, 32, 44].map(
  (px) => `--space-${px}`,
);

const expectedRadiusTokens = [6, 8, 10, 11, 12, 14, 16, 18, 999].map(
  (px) => `--radius-${px}`,
);

const expectedShadowTokens = [
  '--shadow-card',
  '--shadow-toast',
  '--shadow-panel',
  '--shadow-modal',
  '--shadow-focus',
];

const expectedFontTokens = ['--font-sans', '--font-mono', '--font-display'];

describe('styles/tokens.css', () => {
  it('declares a :root block', () => {
    expect(css).toMatch(/:root\s*{/);
  });

  it.each(expectedColorTokens)('declares color token %s', (token) => {
    expect(css).toMatch(new RegExp(`${token}\\s*:`));
  });

  it.each(expectedSpaceTokens)('declares spacing token %s', (token) => {
    expect(css).toMatch(new RegExp(`${token}\\s*:`));
  });

  it.each(expectedRadiusTokens)('declares radius token %s', (token) => {
    expect(css).toMatch(new RegExp(`${token}\\s*:`));
  });

  it.each(expectedShadowTokens)('declares shadow token %s', (token) => {
    expect(css).toMatch(new RegExp(`${token}\\s*:`));
  });

  it.each(expectedFontTokens)('declares font-family token %s', (token) => {
    expect(css).toMatch(new RegExp(`${token}\\s*:`));
  });

  it('exposes HEX values matching design-handoff README for the ink/bg/line anchors', () => {
    expect(css).toMatch(/--ink:\s*#14130f/i);
    expect(css).toMatch(/--bg:\s*#efede8/i);
    expect(css).toMatch(/--line:\s*#e2ded5/i);
  });
});
