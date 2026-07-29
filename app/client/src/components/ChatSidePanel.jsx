import styles from './ChatSidePanel.module.css';
import ChatPanel from './ChatPanel.jsx';
import ParticipantList from './ParticipantList.jsx';
import { TAB_CHAT_LABEL, TAB_PARTICIPANTS_LABEL, CLOSE_BUTTON_LABEL } from './ChatSidePanel.content.js';

/**
 * ChatSidePanel.jsx — сворачиваемая панель Чат/Участники (задача 41).
 *
 * Design addendum §3 (`ChatPanel.jsx`+`ParticipantList.jsx`, RESTRUCTURE),
 * §5.4 «Слияние чата и списка участников в табы» — новый контейнер,
 * объединяющий существующие `ChatPanel.jsx` (задача 28) и `ParticipantList.jsx`
 * (задача 29) под общей сворачиваемой панелью с табами, вместо двух всегда
 * видимых блоков. `ParticipantList.jsx` переиспользуется как содержимое
 * вкладки «Участники» БЕЗ изменения своей внутренней логики (критерий
 * приёмки задачи 41) — этот компонент только оборачивает её в скроллящийся
 * контейнер.
 *
 * Источник значений — `design-handoff/README.md` §5 «Панель чата и
 * участников»: анимация ширины `0 → 344px` (`transition: width .32s
 * cubic-bezier(.2,.8,.2,1)`), закрыта по умолчанию, открывается кнопкой
 * «Чат» в `RoomTopBar.jsx` (задача 38, теперь controlled через `isChatOpen`).
 *
 * Обе вкладки — `ChatPanel` и `ParticipantList` — смонтированы ВСЕГДА,
 * независимо от `isOpen`/`activeTab`; видимость переключается через CSS
 * (`display`), не через unmount. Так черновик ввода `ChatPanel` (его
 * собственный `useState`) не теряется при переключении на вкладку
 * «Участники» и обратно — именно это проверяет критерий приёмки задачи 41
 * («переключение табов не теряет состояние ввода чата»); побочный эффект —
 * то же самое верно и при закрытии/открытии панели целиком (ширина 0,
 * контент остаётся смонтированным).
 *
 * `unread`-счётчик (addendum §5.4) НЕ считается здесь — состояние живёт в
 * `RoomScreen` (единственный источник данных `messages`) и передаётся в
 * `RoomTopBar` отдельным пропом `unreadCount`; этот компонент только
 * получает `activeTab`/`isOpen` и вызывает `onTabChange`/`onClose`, чтобы
 * `RoomScreen` мог сбросить счётчик по правилам §5.4 (сброс при открытии на
 * вкладке «Чат»).
 *
 * Requirements: F-16, US-8, US-9. Design: addendum §3/§5.4, README §5.
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. ChatPanel.jsx/ParticipantList.jsx/RoomTopBar.jsx), PropTypes не
   подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {boolean} [props.isOpen] — открыта ли панель (ширина 344px vs 0);
 *   controlled-состояние из `RoomScreen`.
 * @param {'chat' | 'participants'} [props.activeTab] — активный таб;
 *   controlled-состояние из `RoomScreen`.
 * @param {(tab: 'chat' | 'participants') => void} [props.onTabChange] — клик
 *   по табу шапки панели.
 * @param {() => void} [props.onClose] — клик по кнопке-крестику в шапке.
 * @param {Array<object>} [props.messages] — форвардится в `ChatPanel`
 *   (см. его JSDoc).
 * @param {(text: string) => void} [props.onSend] — форвардится в `ChatPanel`.
 * @param {string} [props.selfId] — форвардится в `ChatPanel`/`ParticipantList`.
 * @param {Array<object>} [props.participants] — форвардится в `ParticipantList`.
 */
function ChatSidePanel({
  isOpen = false,
  activeTab = 'chat',
  onTabChange,
  onClose,
  messages = [],
  onSend,
  selfId,
  participants = [],
}) {
  return (
    <div
      className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}
      data-testid="chat-side-panel"
      data-open={isOpen ? 'true' : 'false'}
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              className={`${styles.tab} ${activeTab === 'chat' ? styles.tabActive : ''}`}
              data-testid="chat-side-panel-tab-chat"
              onClick={() => onTabChange?.('chat')}
            >
              {TAB_CHAT_LABEL}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'participants'}
              className={`${styles.tab} ${activeTab === 'participants' ? styles.tabActive : ''}`}
              data-testid="chat-side-panel-tab-participants"
              onClick={() => onTabChange?.('participants')}
            >
              {TAB_PARTICIPANTS_LABEL}
            </button>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            data-testid="chat-side-panel-close"
            aria-label={CLOSE_BUTTON_LABEL}
            onClick={onClose}
          >
            <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5l14 14" />
              <path d="M19 5L5 19" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div
            className={activeTab === 'chat' ? styles.tabPanel : styles.tabPanelHidden}
            data-testid="chat-side-panel-chat-tab"
          >
            <ChatPanel messages={messages} onSend={onSend} selfId={selfId} />
          </div>
          <div
            className={activeTab === 'participants' ? styles.tabPanel : styles.tabPanelHidden}
            data-testid="chat-side-panel-participants-tab"
          >
            <div className={styles.participantsScroll}>
              <ParticipantList participants={participants} selfId={selfId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default ChatSidePanel;
