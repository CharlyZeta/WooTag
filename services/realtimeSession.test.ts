import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetDoc = vi.fn();
const mockDoc = vi.fn((db: any, col: string, id: string) => ({ path: `${col}/${id}`, id }));

vi.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => (mockDoc as any)(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  onSnapshot: vi.fn(),
  arrayUnion: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('./firebase', () => ({
  db: { name: 'mock-db' },
}));

import { createRoom } from './realtimeSession';
import { AuthSession } from '../types';

const MOCK_SESSION: AuthSession = {
  user: { id: 1, name: 'Admin', slug: 'admin', roles: ['administrator'] },
  config: { url: 'https://test.com', consumerKey: 'ck_test', consumerSecret: 'cs_test' },
  expiresAt: Date.now() + 3600000,
};

describe('realtimeSession - createRoom (FIX-0002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-001: el roomId devuelto tiene al menos 22 caracteres y alfabeto [A-Za-z0-9_-]', async () => {
    const roomId = await createRoom('host_123', MOCK_SESSION, []);
    expect(roomId).toMatch(/^[A-Za-z0-9_-]{22,}$/);
  });

  it('AC-002: genera IDs únicos sin colisiones', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = await createRoom('host_123', MOCK_SESSION, []);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  it('AC-003: Math.random NO es invocado al crear la sala', async () => {
    const mathSpy = vi.spyOn(Math, 'random');
    await createRoom('host_123', MOCK_SESSION, []);
    expect(mathSpy).not.toHaveBeenCalled();
    mathSpy.mockRestore();
  });

  it('AC-004: el roomId es seguro para URLSearchParams sin requerir escape', async () => {
    const roomId = await createRoom('host_123', MOCK_SESSION, []);
    const url = new URL(`https://example.com/app?joinRoom=${roomId}`);
    expect(url.searchParams.get('joinRoom')).toBe(roomId);
  });
});
