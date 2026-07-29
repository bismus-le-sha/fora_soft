/**
 * VideoTile.content.js — пользовательский текст плитки участника (задача 40,
 * `CLAUDE.md` → «Архитектура фронтенда: без хардкода, компонент — кирпичик»).
 *
 * Источник значений: prds/video-chat-room/design-handoff/README.md §4
 * «Рабочая область»/§6 «Заглушка видео (силуэт + имя)»/§9 «Заблокирован
 * autoplay звука».
 */

/** README §6, вариант 1 «Камеру выключили сами». */
export const PLACEHOLDER_OFF_LABEL = 'КАМЕРА ВЫКЛЮЧЕНА';

/** README §6, вариант 2 «Нет доступа / устройство пропало». */
export const PLACEHOLDER_NO_ACCESS_LABEL = 'НЕТ ДОСТУПА К КАМЕРЕ';

/** README §6, вариант 3 «Участник подключается» — «{имя} подключается». */
export const PLACEHOLDER_CONNECTING_SUFFIX = 'подключается';

/** README §6, вариант 3 — подпись под именем. */
export const PLACEHOLDER_CONNECTING_HINT = 'ВИДЕО ВОТ-ВОТ ПОЯВИТСЯ';

/** README §4 «Сцена» — mono-подпись рядом с эквалайзером при активной речи. */
export const SPEAKING_LABEL = 'ГОВОРИТ';

/** README §9 «Заблокирован autoplay звука». */
export const UNMUTE_LABEL = 'Включить звук';

/** aria-label иконки mic-off (не видимый текст, но тоже пользовательская копия). */
export const MIC_OFF_ARIA_LABEL = 'Микрофон выключен';
