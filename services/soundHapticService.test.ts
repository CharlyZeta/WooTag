import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerHaptic, playSoftBeep, playScanSuccessFeedback, _resetAudioContextForTesting } from './soundHapticService';

describe('soundHapticService', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetAudioContextForTesting();
  });

  afterEach(() => {
    _resetAudioContextForTesting();
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  describe('triggerHaptic', () => {
    it('calls navigator.vibrate with duration when supported', () => {
      const mockVibrate = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: mockVibrate },
        configurable: true,
        writable: true,
      });

      const result = triggerHaptic(40);
      expect(result).toBe(true);
      expect(mockVibrate).toHaveBeenCalledWith(40);
    });

    it('returns false safely without throwing when navigator.vibrate is missing', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      expect(() => triggerHaptic(40)).not.toThrow();
      expect(triggerHaptic(40)).toBe(false);
    });

    it('catches and ignores vibrate errors (AC-007)', () => {
      const mockVibrate = vi.fn().mockImplementation(() => {
        throw new Error('SecurityError: Vibration blocked');
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: mockVibrate },
        configurable: true,
        writable: true,
      });

      expect(() => triggerHaptic(40)).not.toThrow();
      expect(triggerHaptic(40)).toBe(false);
    });
  });

  describe('playSoftBeep', () => {
    it('creates and starts oscillator when AudioContext is available', () => {
      const mockOscillator = {
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockCtx = {
        state: 'running',
        currentTime: 0,
        destination: {},
        createOscillator: vi.fn().mockReturnValue(mockOscillator),
        createGain: vi.fn().mockReturnValue(mockGain),
        resume: vi.fn().mockResolvedValue(undefined),
      };

      const mockConstructor = vi.fn(function() { return mockCtx; });
      (globalThis as any).AudioContext = mockConstructor;
      if (typeof window !== 'undefined') {
        (window as any).AudioContext = mockConstructor;
      }

      expect(() => playSoftBeep()).not.toThrow();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      expect(mockCtx.createGain).toHaveBeenCalled();
      expect(mockOscillator.start).toHaveBeenCalled();
    });

    it('gracefully handles missing AudioContext in test/unsupported environments (AC-007)', () => {
      delete (globalThis as any).AudioContext;
      delete (globalThis as any).webkitAudioContext;

      expect(() => playSoftBeep()).not.toThrow();
    });
  });

  describe('playScanSuccessFeedback', () => {
    it('executes both haptic and sound feedback without error', () => {
      const mockVibrate = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: mockVibrate },
        configurable: true,
        writable: true,
      });

      expect(() => playScanSuccessFeedback()).not.toThrow();
      expect(mockVibrate).toHaveBeenCalledWith(40);
    });
  });
});
