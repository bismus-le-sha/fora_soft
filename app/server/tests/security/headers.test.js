import { describe, it, expect, vi } from 'vitest';
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  createSecurityHeadersMiddleware,
} from '../../src/security/headers.js';

const TEST_CONFIG = { PROD_DOMAIN: 'example-app.test' };

describe('security/headers (SEC-13; Design §10.4)', () => {
  describe('buildContentSecurityPolicy', () => {
    it('содержит default-src \'self\'', () => {
      const csp = buildContentSecurityPolicy(TEST_CONFIG);
      expect(csp).toContain("default-src 'self'");
    });

    it('connect-src разрешает self, wss://<PROD_DOMAIN> и STUN', () => {
      const csp = buildContentSecurityPolicy(TEST_CONFIG);
      expect(csp).toContain(
        "connect-src 'self' wss://example-app.test stun:stun.l.google.com:19302",
      );
    });

    it('script-src \'self\' без unsafe-inline (SEC-04)', () => {
      const csp = buildContentSecurityPolicy(TEST_CONFIG);
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toContain('unsafe-inline');
    });

    it('img-src допускает self и data: (силуэт-заглушка)', () => {
      const csp = buildContentSecurityPolicy(TEST_CONFIG);
      expect(csp).toContain("img-src 'self' data:");
    });

    it('media-src допускает self и blob: (MediaStream)', () => {
      const csp = buildContentSecurityPolicy(TEST_CONFIG);
      expect(csp).toContain("media-src 'self' blob:");
    });

    it('frame-ancestors \'none\' (anti-clickjacking)', () => {
      const csp = buildContentSecurityPolicy(TEST_CONFIG);
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('домен читается из config, не хардкодится', () => {
      const csp = buildContentSecurityPolicy({ PROD_DOMAIN: 'another-domain.example' });
      expect(csp).toContain('wss://another-domain.example');
      expect(csp).not.toContain('example-app.test');
    });
  });

  describe('buildSecurityHeaders', () => {
    it('присутствуют CSP, nosniff, Referrer-Policy, X-Frame-Options', () => {
      const headers = buildSecurityHeaders(TEST_CONFIG, false);
      expect(headers['Content-Security-Policy']).toEqual(buildContentSecurityPolicy(TEST_CONFIG));
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Referrer-Policy']).toBe('no-referrer');
      expect(headers['X-Frame-Options']).toBe('DENY');
    });

    it('HSTS отсутствует вне прода (isProduction=false, напр. dev/localhost)', () => {
      const headers = buildSecurityHeaders(TEST_CONFIG, false);
      expect(headers).not.toHaveProperty('Strict-Transport-Security');
    });

    it('HSTS присутствует и корректен в проде (isProduction=true)', () => {
      const headers = buildSecurityHeaders(TEST_CONFIG, true);
      expect(headers['Strict-Transport-Security']).toBe(
        'max-age=63072000; includeSubDomains; preload',
      );
    });

    it('по умолчанию (без явного isProduction) HSTS завязан на NODE_ENV', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(buildSecurityHeaders(TEST_CONFIG)).toHaveProperty('Strict-Transport-Security');

        process.env.NODE_ENV = 'development';
        expect(buildSecurityHeaders(TEST_CONFIG)).not.toHaveProperty(
          'Strict-Transport-Security',
        );

        process.env.NODE_ENV = 'test';
        expect(buildSecurityHeaders(TEST_CONFIG)).not.toHaveProperty(
          'Strict-Transport-Security',
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('createSecurityHeadersMiddleware', () => {
    function fakeRes() {
      const headers = {};
      return {
        headers,
        setHeader: vi.fn((name, value) => {
          headers[name] = value;
        }),
      };
    }

    it('устанавливает все заголовки на res через setHeader и вызывает next() ровно один раз', () => {
      const middleware = createSecurityHeadersMiddleware(TEST_CONFIG);
      const res = fakeRes();
      const next = vi.fn();

      middleware({}, res, next);

      expect(res.headers['Content-Security-Policy']).toContain("default-src 'self'");
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(res.headers['Referrer-Policy']).toBe('no-referrer');
      expect(res.headers['X-Frame-Options']).toBe('DENY');
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it('сигнатура (req, res, next) совместима и с Express, и с голым http-хендлером', () => {
      const middleware = createSecurityHeadersMiddleware(TEST_CONFIG);
      expect(middleware.length).toBe(3);
    });
  });
});
