import { describe, it, expect } from 'vitest';
import {
  hasRTCPeerConnection,
  hasGetUserMedia,
  isSecureContext,
  checkWebrtcSupport,
} from '../../src/lib/compat.js';

/**
 * TDD §4.2/§8, F-36, US-13. `target` — фейковый объект вместо мутации
 * реального `window`, см. JSDoc `compat.js`.
 */
describe('compat: детект поддержки WebRTC/getUserMedia/secure context (F-36, US-13)', () => {
  describe('hasRTCPeerConnection', () => {
    it('true, если RTCPeerConnection — функция', () => {
      expect(hasRTCPeerConnection({ RTCPeerConnection: function () {} })).toBe(true);
    });

    it('false, если RTCPeerConnection отсутствует', () => {
      expect(hasRTCPeerConnection({})).toBe(false);
    });

    it('false, если RTCPeerConnection не функция (испорченный полифилл)', () => {
      expect(hasRTCPeerConnection({ RTCPeerConnection: 'nope' })).toBe(false);
    });
  });

  describe('hasGetUserMedia', () => {
    it('true, если navigator.mediaDevices.getUserMedia — функция', () => {
      expect(
        hasGetUserMedia({ navigator: { mediaDevices: { getUserMedia: function () {} } } }),
      ).toBe(true);
    });

    it('false, если navigator отсутствует', () => {
      expect(hasGetUserMedia({})).toBe(false);
    });

    it('false, если navigator.mediaDevices отсутствует', () => {
      expect(hasGetUserMedia({ navigator: {} })).toBe(false);
    });

    it('false, если getUserMedia не функция', () => {
      expect(hasGetUserMedia({ navigator: { mediaDevices: { getUserMedia: null } } })).toBe(
        false,
      );
    });
  });

  describe('isSecureContext', () => {
    it('true, если window.isSecureContext === true', () => {
      expect(isSecureContext({ isSecureContext: true })).toBe(true);
    });

    it('false, если isSecureContext отсутствует (fail-closed)', () => {
      expect(isSecureContext({})).toBe(false);
    });

    it('false, если isSecureContext === false (HTTP не-localhost)', () => {
      expect(isSecureContext({ isSecureContext: false })).toBe(false);
    });
  });

  describe('checkWebrtcSupport', () => {
    const fullSupport = {
      RTCPeerConnection: function () {},
      navigator: { mediaDevices: { getUserMedia: function () {} } },
      isSecureContext: true,
    };

    it('supported: true, когда все три проверки проходят', () => {
      expect(checkWebrtcSupport(fullSupport)).toEqual({
        webrtc: true,
        getUserMedia: true,
        secureContext: true,
        supported: true,
      });
    });

    it('supported: false, если нет RTCPeerConnection (остальное поддерживается)', () => {
      const target = { ...fullSupport, RTCPeerConnection: undefined };
      const result = checkWebrtcSupport(target);
      expect(result.webrtc).toBe(false);
      expect(result.supported).toBe(false);
    });

    it('supported: false, если нет getUserMedia (остальное поддерживается)', () => {
      const target = { ...fullSupport, navigator: {} };
      const result = checkWebrtcSupport(target);
      expect(result.getUserMedia).toBe(false);
      expect(result.supported).toBe(false);
    });

    it('supported: false, если не secure context (остальное поддерживается)', () => {
      const target = { ...fullSupport, isSecureContext: false };
      const result = checkWebrtcSupport(target);
      expect(result.secureContext).toBe(false);
      expect(result.supported).toBe(false);
    });

    it('supported: false в полностью пустом окружении', () => {
      expect(checkWebrtcSupport({}).supported).toBe(false);
    });

    it('без аргумента использует globalThis по умолчанию (не бросает)', () => {
      expect(() => checkWebrtcSupport()).not.toThrow();
    });
  });
});
