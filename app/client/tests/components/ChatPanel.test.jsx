import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ChatPanel from '../../src/components/ChatPanel.jsx';

/**
 * Задача 28 (подзадача 28.1) — `ChatPanel` — XSS-безопасный рендер чата
 * (Design §4.2, §7.4, §10.1 SEC-04, §11.2; F-12, F-13, F-14, F-24; US-8; SEC-04).
 *
 * RED-фаза (TDD): компонент `app/client/src/components/ChatPanel.jsx` ещё НЕ
 * существует — импорт выше должен падать (module-not-found), это ожидаемо и
 * подтверждает red. `implementer` (28.2) делает тесты зелёными, НЕ меняя их.
 *
 * Контракт компонента (зафиксирован здесь, implementer обязан ему следовать):
 *   props:
 *     - messages: Array<Message> — история + новые сообщения (Design §5.1):
 *         chat:   { id, kind:'chat',   authorId, authorName, text, ts }
 *         system: { id, kind:'system', event:'join'|'leave', subjectName, ts }
 *       `ts` — серверное время (ms); формат HH:MM считает клиент по локали (F-13).
 *     - onSend: (text: string) => void — колбэк отправки непустого текста.
 *       Реальная эмиссия `signaling.emit('chat:send')` — ответственность
 *       RoomScreen; ChatPanel — презентационный, только вызывает onSend.
 *     - selfId?: string — id текущего участника (для пометки своих сообщений;
 *       для этих тестов некритичен).
 *   data-testid контракт:
 *     - chat-panel            — корень
 *     - chat-messages         — контейнер истории (скроллится)
 *     - chat-message          — элемент одного сообщения (по одному на сообщение)
 *     - chat-message-text     — текстовый узел сообщения ({text}) — SEC-04
 *     - chat-message-author   — имя автора ({authorName}) — SEC-04
 *     - chat-input            — поле ввода (input/textarea)
 *     - chat-send-button      — кнопка отправки (disabled при пустом/пробельном вводе)
 *   Автопрокрутка (F-14): при монтировании и при добавлении нового сообщения
 *     ChatPanel прокручивает историю к последнему сообщению через
 *     `Element.prototype.scrollIntoView` (jsdom не считает layout, поэтому
 *     тесты мокают именно этот метод — стандартный React-паттерн «ref на
 *     нижний якорь + scrollIntoView»).
 *
 * По прецеденту `ControlBar.test.jsx`/`VideoTile.test.jsx` — рендер через RTL,
 * клики/ввод через `fireEvent` (@testing-library/user-event в проекте не
 * установлена), пропсы типизируются JSDoc, PropTypes не подключены.
 */

const XSS_IMG = '<img src=x onerror=alert(1)>';
const XSS_SCRIPT = '<script>alert(1)</script>';

function chatMessage(overrides = {}) {
  return {
    id: 'm1',
    kind: 'chat',
    authorId: 'p1',
    authorName: 'Алекс',
    text: 'Привет',
    ts: Date.UTC(2026, 0, 1, 10, 30, 0),
    ...overrides,
  };
}

function renderChatPanel(props = {}) {
  const onSend = vi.fn();
  const utils = render(<ChatPanel messages={[]} onSend={onSend} {...props} />);
  return { ...utils, onSend };
}

describe('ChatPanel (Design §4.2/§7.4/§10.1, критерий приёмки задачи 28)', () => {
  let scrollIntoView;

  beforeEach(() => {
    // jsdom не реализует scrollIntoView — мок нужен и чтобы код не падал,
    // и чтобы проверить факт автопрокрутки (F-14).
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    // Ловушка на исполнение инъекции: если XSS-payload как-то исполнится
    // (onerror/inline script), alert будет вызван — тест это поймает.
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── SEC-04: XSS-безопасный рендер (критичный кейс) ──────────────────────
  describe('SEC-04 — рендер текстовыми узлами, XSS не исполняется', () => {
    it('payload <img onerror> в тексте сообщения рендерится как литеральный текст, без <img> в DOM', () => {
      const { getByTestId, container } = renderChatPanel({
        messages: [chatMessage({ id: 'x1', text: XSS_IMG })],
      });

      // Текст виден буквально как строка…
      expect(getByTestId('chat-message-text').textContent).toBe(XSS_IMG);
      // …и НЕ превратился в реальный DOM-узел <img> (что случилось бы при
      // dangerouslySetInnerHTML/innerHTML) → onerror не может выстрелить.
      expect(container.querySelector('img')).toBeNull();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it('payload <script> в тексте сообщения рендерится как текст, без <script> в DOM', () => {
      const { getByTestId, container } = renderChatPanel({
        messages: [chatMessage({ id: 'x2', text: XSS_SCRIPT })],
      });

      expect(getByTestId('chat-message-text').textContent).toBe(XSS_SCRIPT);
      expect(container.querySelector('script')).toBeNull();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it('XSS-payload в имени автора тоже рендерится текстом, без инъекции в DOM', () => {
      const { getByTestId, container } = renderChatPanel({
        messages: [chatMessage({ id: 'x3', authorName: XSS_IMG, text: 'hi' })],
      });

      expect(getByTestId('chat-message-author').textContent).toContain(XSS_IMG);
      expect(container.querySelector('img')).toBeNull();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it('payload, пришедший как НОВОЕ сообщение (ре-рендер), тоже не исполняется', () => {
      const { container, rerender } = renderChatPanel({ messages: [] });

      rerender(
        <ChatPanel
          messages={[chatMessage({ id: 'x4', text: XSS_SCRIPT })]}
          onSend={vi.fn()}
        />,
      );

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(globalThis.alert).not.toHaveBeenCalled();
    });
  });

  // ── Запрет пустых сообщений (F-24, US-8, SEC-05) ────────────────────────
  describe('запрет пустых/пробельных сообщений', () => {
    it('пустой ввод — кнопка отправки disabled', () => {
      const { getByTestId } = renderChatPanel();
      expect(getByTestId('chat-send-button').disabled).toBe(true);
    });

    it('ввод только из пробелов — кнопка отправки disabled, submit не эмитит onSend', () => {
      const { getByTestId, onSend } = renderChatPanel();
      const input = getByTestId('chat-input');

      fireEvent.change(input, { target: { value: '   \t  ' } });

      expect(getByTestId('chat-send-button').disabled).toBe(true);
      // Даже если попытаться отправить — колбэк не зовётся.
      fireEvent.click(getByTestId('chat-send-button'));
      fireEvent.submit(input.closest('form') ?? input);
      expect(onSend).not.toHaveBeenCalled();
    });

    it('непустой ввод — кнопка активна, отправка вызывает onSend с текстом', () => {
      const { getByTestId, onSend } = renderChatPanel();
      const input = getByTestId('chat-input');

      fireEvent.change(input, { target: { value: 'Привет всем' } });

      expect(getByTestId('chat-send-button').disabled).toBe(false);
      fireEvent.click(getByTestId('chat-send-button'));
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend.mock.calls[0][0]).toContain('Привет всем');
    });
  });

  // ── Поздняя история (F-14): вошедший позже видит прошлые сообщения ───────
  describe('отображение переданной истории (F-14)', () => {
    it('ChatPanel, отрендеренный сразу с непустой историей, показывает все сообщения', () => {
      const history = [
        chatMessage({ id: 'h1', authorName: 'Алекс', text: 'первое' }),
        chatMessage({ id: 'h2', authorName: 'Боб', text: 'второе' }),
        chatMessage({ id: 'h3', authorName: 'Вика', text: 'третье' }),
      ];
      const { getAllByTestId, getByTestId } = renderChatPanel({ messages: history });

      expect(getAllByTestId('chat-message')).toHaveLength(3);
      const texts = getAllByTestId('chat-message-text').map((n) => n.textContent);
      expect(texts).toEqual(['первое', 'второе', 'третье']);
      expect(getByTestId('chat-messages')).toBeTruthy();
    });
  });

  // ── Автопрокрутка к последнему сообщению (F-14) ─────────────────────────
  describe('автопрокрутка к последнему сообщению (F-14)', () => {
    it('при добавлении нового сообщения история прокручивается вниз (scrollIntoView)', () => {
      const { rerender } = renderChatPanel({
        messages: [chatMessage({ id: 'a1', text: 'один' })],
      });

      scrollIntoView.mockClear();

      rerender(
        <ChatPanel
          messages={[
            chatMessage({ id: 'a1', text: 'один' }),
            chatMessage({ id: 'a2', text: 'два' }),
          ]}
          onSend={vi.fn()}
        />,
      );

      expect(scrollIntoView).toHaveBeenCalled();
    });
  });
});
