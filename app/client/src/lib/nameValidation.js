const NAME_MAX = 30;
const NAME_ALLOWED_RE = /^[A-Za-zА-Яа-яЁё0-9 _.-]+$/;

export const NAME_ERROR_CODES = {
  empty: 'empty',
  tooLong: 'too-long',
  invalidChars: 'invalid-chars',
};

export function validateParticipantName(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, code: NAME_ERROR_CODES.empty, value: '' };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, code: NAME_ERROR_CODES.empty, value: trimmed };
  }

  if (trimmed.length > NAME_MAX) {
    return { ok: false, code: NAME_ERROR_CODES.tooLong, value: trimmed };
  }

  if (!NAME_ALLOWED_RE.test(trimmed)) {
    return { ok: false, code: NAME_ERROR_CODES.invalidChars, value: trimmed };
  }

  return { ok: true, value: trimmed };
}

export { NAME_MAX };
