import { useEffect, useRef, useState } from 'react';

/**
 * ChatPanel.jsx — история чата + автопрокрутка + ввод (задача 28.2).
 *
 * Design §4.2: «`ChatPanel.jsx` | Рендер истории (текстовыми узлами `{text}`
 * — SEC-04), автопрокрутка, ввод, запрет пустых. | props: —».
 * Design §7.4 (sequence): `A->>S: chat:send{text}` → `S-->>All: chat:message
 * {id, authorId, authorName, text, ts}` → «рендер `{text}` текстовым узлом
 * (SEC-04) + автопрокрутка». `RoomScreen` подписывается на `chat:message`/
 * `chat:system` и передаёт накопленный массив сюда через `messages` — сам
 * сокет ChatPanel не трогает (тот же презентационный паттерн, что
 * `RoomTopBar`/`VideoTile`, задачи 26/27).
 * Design §10.1 SEC-04: «React рендерит пользовательский контент только через
 * `{value}` (текстовые узлы) … `dangerouslySetInnerHTML` запрещён (lint-
 * правило)». Здесь `authorName`/`text` рендерятся ИСКЛЮЧИТЕЛЬНО как `{value}`
 * — никакого `dangerouslySetInnerHTML`/`innerHTML`/ручного DOM.
 *
 * Requirements: F-12, F-13, F-14, F-15, F-24, US-8, US-9, SEC-04, SEC-05.
 * Design: §4.2, §7.4, §10.1.
 *
 * Контракт пропсов и data-testid зафиксирован в шапке
 * `app/client/tests/components/ChatPanel.test.jsx` (задача 28.1) — этот
 * компонент следует ему буквально.
 */

/**
 * @param {number} ts — серверное время сообщения (ms, `Date.now()`-совместимо).
 * @returns {string} — `HH:MM` по локальному времени клиента (F-13).
 */
function formatTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Текст системного сообщения (F-15, US-9): вход/выход участника.
 * @param {{event?: string, subjectName?: string}} message
 * @returns {string}
 */
function systemText(message) {
  const name = message.subjectName ?? '';
  return message.event === 'leave'
    ? `${name} покинул(а) комнату`
    : `${name} присоединился(ась) к комнате`;
}

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. VideoGrid.jsx/VideoTile.jsx/RoomTopBar.jsx/JoinGate.jsx/StartScreen.jsx),
   PropTypes не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {Array<object>} [props.messages] — история + новые сообщения
 *   (Design §5.1): `{id, kind:'chat', authorId, authorName, text, ts}` или
 *   `{id, kind:'system', event:'join'|'leave', subjectName, ts}`.
 * @param {(text: string) => void} props.onSend — колбэк отправки непустого
 *   (после trim) текста; реальная эмиссия `chat:send` — ответственность
 *   `RoomScreen` (Design §7.4).
 * @param {string} [props.selfId] — id текущего участника, для пометки своих
 *   сообщений.
 */
function ChatPanel({ messages = [], onSend, selfId }) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  // F-14: автопрокрутка к последнему сообщению — и при монтировании (поздно
  // вошедший видит конец истории), и при добавлении нового.
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages]);

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0;

  /** Запрет пустых/пробельных сообщений (F-24, US-8, SEC-05). */
  function trySend() {
    if (!canSend) {
      return;
    }
    onSend(trimmed);
    setDraft('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    trySend();
  }

  return (
    <div className="chat-panel" data-testid="chat-panel">
      <div className="chat-messages" data-testid="chat-messages">
        {messages.map((message) =>
          message.kind === 'system' ? (
            <div className="chat-message chat-message-system" data-testid="chat-message" key={message.id}>
              <span className="chat-message-text" data-testid="chat-message-text">
                {systemText(message)}
              </span>
              <span className="chat-message-time">{formatTime(message.ts)}</span>
            </div>
          ) : (
            <div
              className="chat-message"
              data-testid="chat-message"
              data-self={message.authorId === selfId ? 'true' : 'false'}
              key={message.id}
            >
              <span className="chat-message-author" data-testid="chat-message-author">
                {message.authorName}
              </span>
              <span className="chat-message-time">{formatTime(message.ts)}</span>
              <span className="chat-message-text" data-testid="chat-message-text">
                {message.text}
              </span>
            </div>
          ),
        )}
        <div ref={bottomRef} data-testid="chat-messages-end" />
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          data-testid="chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Написать сообщение…"
        />
        <button
          type="button"
          className="chat-send-button"
          data-testid="chat-send-button"
          disabled={!canSend}
          onClick={trySend}
        >
          Отправить
        </button>
      </form>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default ChatPanel;
