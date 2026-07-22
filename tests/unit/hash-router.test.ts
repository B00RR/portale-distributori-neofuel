import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  parseHash,
  getCurrentRoute,
  updateHash,
  onHashChange
} from '../../js/shared/hash-router.js';

describe('Hash Router (shared)', () => {
  beforeEach(() => {
    window.history.pushState(null, '', '/');
  });

  describe('parseHash', () => {
    it('parses a valid admin route', () => {
      expect(parseHash('#/admin/vouchers')).toEqual({ area: 'admin', view: 'vouchers' });
    });

    it('parses a valid operator route', () => {
      expect(parseHash('#/operator/fatture')).toEqual({ area: 'operator', view: 'fatture' });
    });

    it('accepts views with dashes and underscores', () => {
      expect(parseHash('#/admin/dashboard-config')).toEqual({
        area: 'admin',
        view: 'dashboard-config'
      });
      expect(parseHash('#/operator/extra_income')).toEqual({
        area: 'operator',
        view: 'extra_income'
      });
    });

    it('rejects empty and non-route hashes', () => {
      expect(parseHash('')).toBeNull();
      expect(parseHash('#')).toBeNull();
      expect(parseHash('#section')).toBeNull();
      expect(parseHash('#/')).toBeNull();
    });

    it('rejects unknown areas', () => {
      expect(parseHash('#/superuser/panel')).toBeNull();
    });

    it('rejects missing or extra segments', () => {
      expect(parseHash('#/admin')).toBeNull();
      expect(parseHash('#/admin/')).toBeNull();
      expect(parseHash('#/admin/vouchers/extra')).toBeNull();
    });

    it('rejects views with unsafe characters', () => {
      expect(parseHash('#/admin/<script>')).toBeNull();
      expect(parseHash('#/admin/a b')).toBeNull();
    });
  });

  describe('getCurrentRoute', () => {
    it('reads the route from window.location', () => {
      window.history.pushState(null, '', '#/admin/shifts');
      expect(getCurrentRoute()).toEqual({ area: 'admin', view: 'shifts' });
    });

    it('returns null when no route is set', () => {
      expect(getCurrentRoute()).toBeNull();
    });
  });

  describe('updateHash', () => {
    it('writes the route into the URL', () => {
      updateHash('admin', 'operators');
      expect(window.location.hash).toBe('#/admin/operators');
    });

    it('does not fire hashchange for programmatic navigation', () => {
      const listener = vi.fn();
      window.addEventListener('hashchange', listener);
      updateHash('operator', 'prezzi');
      window.removeEventListener('hashchange', listener);
      expect(listener).not.toHaveBeenCalled();
    });

    it('no-ops when the hash is already current', () => {
      updateHash('admin', 'dashboard');
      const pushSpy = vi.spyOn(window.history, 'pushState');
      updateHash('admin', 'dashboard');
      expect(pushSpy).not.toHaveBeenCalled();
    });
  });

  describe('onHashChange', () => {
    it('invokes the handler for routes of the subscribed area', () => {
      const handler = vi.fn();
      const unsubscribe = onHashChange('admin', handler);

      window.history.pushState(null, '', '#/admin/crediti');
      window.dispatchEvent(new Event('hashchange'));

      expect(handler).toHaveBeenCalledWith('crediti');
      unsubscribe();
    });

    it('invokes the handler on popstate (browser back/forward)', () => {
      const handler = vi.fn();
      const unsubscribe = onHashChange('admin', handler);

      window.history.pushState(null, '', '#/admin/vouchers');
      window.dispatchEvent(new Event('popstate'));

      expect(handler).toHaveBeenCalledWith('vouchers');
      unsubscribe();
    });

    it('ignores routes of other areas and malformed hashes', () => {
      const handler = vi.fn();
      const unsubscribe = onHashChange('admin', handler);

      window.history.pushState(null, '', '#/operator/voucher');
      window.dispatchEvent(new Event('hashchange'));
      window.history.pushState(null, '', '#plain-anchor');
      window.dispatchEvent(new Event('hashchange'));

      expect(handler).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('stops listening after unsubscribe', () => {
      const handler = vi.fn();
      const unsubscribe = onHashChange('operator', handler);
      unsubscribe();

      window.history.pushState(null, '', '#/operator/uscite');
      window.dispatchEvent(new Event('hashchange'));
      window.dispatchEvent(new Event('popstate'));

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
