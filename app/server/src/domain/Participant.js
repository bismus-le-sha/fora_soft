/**
 * Участник комнаты (RAM, без персистентности).
 *
 * `id` = `socket.id` — присваивается сервером, никогда не приходит от
 * клиента как поле полезной нагрузки (SEC-06). Наружу (в UI) внутренний id
 * не имеет смысловой нагрузки, кроме адресации внутри комнаты (F-30).
 *
 * Requirements: F-05, F-09, F-16, F-30, SEC-06. Design: §5.1.
 */
export class Participant {
  /**
   * @param {object} params
   * @param {string} params.id - socket.id участника.
   * @param {string} params.name - валидированное+санитизированное имя (≤ NAME_MAX).
   * @param {{audio: boolean, video: boolean}} [params.media] - начальное состояние тумблеров.
   */
  constructor({ id, name, media = { audio: true, video: true } }) {
    this.id = id;
    this.name = name;
    this.media = { audio: !!media.audio, video: !!media.video };
    this.joinedAt = Date.now();
  }

  /** Снимок для передачи по сети (join:ok.participants / participant:joined). */
  toSnapshot() {
    return { id: this.id, name: this.name, media: { ...this.media } };
  }

  /**
   * Обновляет статус mic/cam (задача 13, `media:state`). Значения обязаны
   * быть уже валидированным `boolean` (см. `lib/validate.validateMedia`) —
   * этот метод не валидирует вход повторно.
   * @param {{audio: boolean, video: boolean}} media
   */
  setMedia({ audio, video }) {
    this.media = { audio, video };
  }
}

export default Participant;
