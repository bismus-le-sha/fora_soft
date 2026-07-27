import { useState } from 'react';

/**
 * StartScreen — стартовый экран: ввод имени + «Создать комнату» (задача 19).
 *
 * Design §4.2 (таблица компонентов): «`StartScreen.jsx` | Ввод имени
 * (клиентская валидация — UX), «Создать комнату» → генерирует roomId и
 * переходит на `/room/:id`. | props: `onCreate(name)`».
 * Design §6.4 (URL-контракт): «Создание комнаты на StartScreen генерирует
 * `roomId = crypto.randomUUID()` (SEC-14) и делает `navigate(/room/:roomId)`».
 *
 * Requirements: F-01, F-02, US-1, US-2.
 *
 * Компонент сам НЕ генерирует roomId и НЕ выполняет навигацию — это
 * ответственность вызывающей стороны (композиционный корень, App.jsx/будущая
 * задача маршрутизации), которая передаёт конкретный `onCreate(name)`,
 * вызывающий `generateRoomId()` (`lib/roomId.js`, SEC-14) и переход на
 * `/room/:roomId`. Здесь эта связка проверяется контрактно — валидный сабмит
 * триггерит `onCreate`, невалидный — нет (см. `tests/screens/StartScreen.test.jsx`).
 *
 * Валидация здесь — **только UX** (блокировка кнопки при пустом/пробельном
 * имени). Источник истины — серверная `validateName` (SEC-01, Design §4.1);
 * клиент ей не подменяет и не заменяет.
 */

/** PRD §4 «Стартовый экран»: поле имени до 30 символов (US-1, UX-подсказка). */
const NAME_MAX = 30;

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. signalingClient.js/compat.js), PropTypes как рантайм-зависимость не
   подключена (Design §3.2/§10.5 SEC-19 — минимум прод-зависимостей). */

/**
 * @param {object} props
 * @param {(name: string) => void} props.onCreate — вызывается с валидным
 *   (непустым после trim) именем при клике «Создать комнату» (Design §4.2).
 */
function StartScreen({ onCreate }) {
  const [name, setName] = useState('');

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) {
      return;
    }
    onCreate(trimmedName);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="start-screen-name">Имя</label>
      <input
        id="start-screen-name"
        type="text"
        value={name}
        maxLength={NAME_MAX}
        autoComplete="name"
        placeholder="Введите имя"
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={!isValid}>
        Создать комнату
      </button>
    </form>
  );
}

/* eslint-enable react/prop-types */

export default StartScreen;
