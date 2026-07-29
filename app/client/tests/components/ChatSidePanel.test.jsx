import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ChatSidePanel from '../../src/components/ChatSidePanel.jsx';

/**
 * Задача 41 — `ChatSidePanel` — сворачиваемая панель Чат/Участники (слияние
 * `ChatPanel.jsx` + `ParticipantList.jsx`, design addendum §3/§5.4, README §5).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 41): «переключение
 * табов не теряет состояние ввода чата» + структурный контракт табов/шапки.
 * `unread`-логика (addendum §5.4) живёт в `RoomScreen` — покрыта
 * `tests/screens/RoomScreen.test.jsx`, не здесь (этот компонент только
 * получает `activeTab`/`isOpen` и вызывает колбэки).
 */

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderPanel(props = {}) {
  const onTabChange = vi.fn();
  const onClose = vi.fn();
  const onSend = vi.fn();

  const utils = render(
    <ChatSidePanel
      isOpen
      activeTab="chat"
      onTabChange={onTabChange}
      onClose={onClose}
      messages={[]}
      onSend={onSend}
      selfId="self-1"
      participants={[{ id: 'self-1', name: 'Алекс' }]}
      {...props}
    />,
  );

  return { ...utils, onTabChange, onClose, onSend };
}

describe('ChatSidePanel (Design addendum §3/§5.4, критерий приёмки задачи 41)', () => {
  describe('структура шапки', () => {
    it('рендерит оба таба и кнопку закрытия', () => {
      const { getByTestId } = renderPanel();

      expect(getByTestId('chat-side-panel-tab-chat')).toBeTruthy();
      expect(getByTestId('chat-side-panel-tab-participants')).toBeTruthy();
      expect(getByTestId('chat-side-panel-close')).toBeTruthy();
    });

    it('aria-selected отражает activeTab', () => {
      const { getByTestId, rerender } = renderPanel({ activeTab: 'chat' });

      expect(getByTestId('chat-side-panel-tab-chat').getAttribute('aria-selected')).toBe('true');
      expect(getByTestId('chat-side-panel-tab-participants').getAttribute('aria-selected')).toBe('false');

      rerender(
        <ChatSidePanel
          isOpen
          activeTab="participants"
          onTabChange={vi.fn()}
          onClose={vi.fn()}
          messages={[]}
          onSend={vi.fn()}
          selfId="self-1"
          participants={[]}
        />,
      );

      expect(getByTestId('chat-side-panel-tab-chat').getAttribute('aria-selected')).toBe('false');
      expect(getByTestId('chat-side-panel-tab-participants').getAttribute('aria-selected')).toBe('true');
    });

    it('клик по табу вызывает onTabChange с соответствующим значением', () => {
      const { getByTestId, onTabChange } = renderPanel();

      fireEvent.click(getByTestId('chat-side-panel-tab-participants'));
      expect(onTabChange).toHaveBeenCalledWith('participants');

      fireEvent.click(getByTestId('chat-side-panel-tab-chat'));
      expect(onTabChange).toHaveBeenCalledWith('chat');
    });

    it('клик по крестику вызывает onClose', () => {
      const { getByTestId, onClose } = renderPanel();

      fireEvent.click(getByTestId('chat-side-panel-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('data-open отражает isOpen', () => {
    it('isOpen=false → data-open="false"', () => {
      const { getByTestId } = renderPanel({ isOpen: false });
      expect(getByTestId('chat-side-panel').getAttribute('data-open')).toBe('false');
    });

    it('isOpen=true → data-open="true"', () => {
      const { getByTestId } = renderPanel({ isOpen: true });
      expect(getByTestId('chat-side-panel').getAttribute('data-open')).toBe('true');
    });
  });

  describe('содержимое вкладок', () => {
    it('«Чат» рендерит ChatPanel (chat-panel, chat-input)', () => {
      const { getByTestId } = renderPanel({
        messages: [{ id: 'm1', kind: 'chat', authorId: 'p1', authorName: 'Боб', text: 'Привет', ts: 1 }],
      });

      expect(getByTestId('chat-panel').textContent).toContain('Привет');
      expect(getByTestId('chat-input')).toBeTruthy();
    });

    it('«Участники» рендерит ParticipantList без изменения его внутренней логики', () => {
      const { getByTestId } = renderPanel({
        participants: [
          { id: 'self-1', name: 'Алекс' },
          { id: 'p2', name: 'Боб' },
        ],
      });

      expect(getByTestId('participant-list').textContent).toContain('Алекс');
      expect(getByTestId('participant-list').textContent).toContain('Боб');
    });
  });

  describe('переключение табов не теряет состояние ввода чата (критерий приёмки задачи 41)', () => {
    it('черновик в chat-input сохраняется после переключения на «Участники» и обратно', () => {
      const { getByTestId, rerender } = renderPanel({ activeTab: 'chat' });

      const input = getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'недописанное сообщение' } });
      expect(getByTestId('chat-input').value).toBe('недописанное сообщение');

      // Переключение на вкладку «Участники» — ChatPanel не размонтируется
      // (видимость через CSS, см. JSDoc компонента), только становится скрытым.
      rerender(
        <ChatSidePanel
          isOpen
          activeTab="participants"
          onTabChange={vi.fn()}
          onClose={vi.fn()}
          messages={[]}
          onSend={vi.fn()}
          selfId="self-1"
          participants={[]}
        />,
      );

      // Возврат на «Чат» — черновик должен быть тем же, что был введён.
      rerender(
        <ChatSidePanel
          isOpen
          activeTab="chat"
          onTabChange={vi.fn()}
          onClose={vi.fn()}
          messages={[]}
          onSend={vi.fn()}
          selfId="self-1"
          participants={[]}
        />,
      );

      expect(getByTestId('chat-input').value).toBe('недописанное сообщение');
    });

    it('закрытие панели (isOpen=false) и повторное открытие тоже не теряет черновик', () => {
      const { getByTestId, rerender } = renderPanel({ isOpen: true, activeTab: 'chat' });

      fireEvent.change(getByTestId('chat-input'), { target: { value: 'ещё не отправлено' } });

      rerender(
        <ChatSidePanel
          isOpen={false}
          activeTab="chat"
          onTabChange={vi.fn()}
          onClose={vi.fn()}
          messages={[]}
          onSend={vi.fn()}
          selfId="self-1"
          participants={[]}
        />,
      );

      rerender(
        <ChatSidePanel
          isOpen
          activeTab="chat"
          onTabChange={vi.fn()}
          onClose={vi.fn()}
          messages={[]}
          onSend={vi.fn()}
          selfId="self-1"
          participants={[]}
        />,
      );

      expect(getByTestId('chat-input').value).toBe('ещё не отправлено');
    });
  });
});
