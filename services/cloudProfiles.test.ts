/**
 * cloudProfiles.test.ts — Tests para el servicio de perfiles en la nube
 *
 * Cubre:
 * 1. loadCloudProfile: documento existente, documento nuevo (default)
 * 2. updateCloudProfile: llamada correcta a setDoc con merge
 * 3. subscribeToCloudProfile: invoca callback cuando el documento existe
 *
 * Se mockea firebase/firestore y ./firebase para evitar conexión real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockDoc = vi.fn((db: any, col: string, id: string) => ({ path: `${col}/${id}` }));

vi.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => mockDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
}));

vi.mock('./firebase', () => ({
  db: { name: 'mock-db' },
}));

import {
  loadCloudProfile,
  updateCloudProfile,
  subscribeToCloudProfile,
  UserCloudProfile,
} from './cloudProfiles';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const UID = 'user-123';

const MOCK_PROFILE: UserCloudProfile = {
  wooSession: null,
  designProfiles: [{ id: '1', name: 'Perfil Test', config: {} as any }],
  tagConfig: null,
  products: [],
  lastProductsDevice: '',
};

const DEFAULT_PROFILE: UserCloudProfile = {
  wooSession: null,
  designProfiles: [],
  tagConfig: null,
  products: [],
  lastProductsDevice: '',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
});

// ─── 1. loadCloudProfile ──────────────────────────────────────────────────────

describe('loadCloudProfile', () => {
  it('retorna los datos del usuario si el documento existe', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => MOCK_PROFILE,
    });

    const result = await loadCloudProfile(UID);

    expect(result).toEqual(MOCK_PROFILE);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('crea un perfil por defecto si el documento NO existe', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
      data: () => null,
    });

    const result = await loadCloudProfile(UID);

    expect(result).toEqual(DEFAULT_PROFILE);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data).toEqual(DEFAULT_PROFILE);
  });

  it('propaga el error si getDoc falla', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('Firestore unavailable'));

    await expect(loadCloudProfile(UID)).rejects.toThrow('Firestore unavailable');
  });
});

// ─── 2. updateCloudProfile ────────────────────────────────────────────────────

describe('updateCloudProfile', () => {
  it('llama a setDoc con merge:true y los datos parciales', async () => {
    const partial: Partial<UserCloudProfile> = { tagConfig: null };

    await updateCloudProfile(UID, partial);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = mockSetDoc.mock.calls[0];
    expect(ref).toBeDefined();
    expect(data).toEqual(partial);
    expect(options).toEqual({ merge: true });
  });

  it('propaga el error si setDoc falla', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('Write permission denied'));

    await expect(updateCloudProfile(UID, {})).rejects.toThrow('Write permission denied');
  });
});

// ─── 3. subscribeToCloudProfile ───────────────────────────────────────────────

describe('subscribeToCloudProfile', () => {
  it('invoca el callback con los datos cuando el documento existe', () => {
    const mockUnsubscribe = vi.fn();

    // onSnapshot invoca el handler inmediatamente con el docSnap
    mockOnSnapshot.mockImplementation((_ref: any, handler: (snap: any) => void) => {
      handler({ exists: () => true, data: () => MOCK_PROFILE });
      return mockUnsubscribe;
    });

    const callback = vi.fn();
    const unsubscribe = subscribeToCloudProfile(UID, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(MOCK_PROFILE);
    expect(typeof unsubscribe).toBe('function');
  });

  it('NO invoca el callback si el documento no existe', () => {
    mockOnSnapshot.mockImplementation((_ref: any, handler: (snap: any) => void) => {
      handler({ exists: () => false, data: () => null });
      return vi.fn();
    });

    const callback = vi.fn();
    subscribeToCloudProfile(UID, callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it('retorna la función de cancelación de la suscripción', () => {
    const mockUnsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(mockUnsubscribe);

    const unsubscribe = subscribeToCloudProfile(UID, vi.fn());

    expect(unsubscribe).toBe(mockUnsubscribe);
  });
});
