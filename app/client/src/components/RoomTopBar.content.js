/**
 * RoomTopBar.content.js — пользовательский текст верхней плашки комнаты
 * (задача 38, `CLAUDE.md` → «Архитектура фронтенда: без хардкода, компонент
 * — кирпичик»).
 *
 * Источник значений: prds/video-chat-room/design-handoff/README.md §4
 * «Верхняя плашка».
 */

export const MEDIA_BUTTON_LABELS = {
  audioOn: 'Выключить микрофон',
  audioOff: 'Включить микрофон',
  videoOn: 'Выключить камеру',
  videoOff: 'Включить камеру',
};

export const COPY_LINK_LABEL = 'Скопировать ссылку';
export const COPY_LINK_TOAST_TEXT = 'ссылка скопирована';

export const CHAT_BUTTON_LABEL = 'Чат';

export const LEAVE_BUTTON_LABEL = 'Выйти';

/** README §4: «счётчик участников… число — JetBrains Mono 12px». */
export function formatParticipantCounter(count, capacity) {
  return `${count}/${capacity}`;
}
