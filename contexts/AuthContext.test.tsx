/**
 * AuthContext.test.tsx — Tests para el contexto de autenticación Firebase
 *
 * Cubre:
 * 1. Estado inicial: currentUser null, loading true hasta que onAuthStateChanged resuelve
 * 2. login: delega a signInWithEmailAndPassword
 * 3. register: delega a createUserWithEmailAndPassword
 * 4. logout: delega a signOut
 * 5. resetPassword: delega a sendPasswordResetEmail
 * 6. currentUser: se actualiza cuando onAuthStateChanged dispara con usuario
 *
 * Se mockea firebase/auth y ../services/firebase para evitar instancias reales.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Guardamos la referencia del callback para dispararlo manualmente en los tests
let authStateCallback: ((user: any) => void) | null = null;

const mockSignIn = vi.fn();
const mockCreateUser = vi.fn();
const mockSignOut = vi.fn();
const mockSendPasswordReset = vi.fn();

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: any, callback: (user: any) => void) => {
    authStateCallback = callback;
    // Retorna una función de cancelación
    return () => { authStateCallback = null; };
  },
  signInWithEmailAndPassword: (...args: any[]) => mockSignIn(...args),
  createUserWithEmailAndPassword: (...args: any[]) => mockCreateUser(...args),
  signOut: (...args: any[]) => mockSignOut(...args),
  sendPasswordResetEmail: (...args: any[]) => mockSendPasswordReset(...args),
}));

vi.mock('../services/firebase', () => ({
  auth: { name: 'mock-auth' },
}));

import { AuthProvider, useAuth } from './AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Componente auxiliar que expone el contexto para testear */
const TestConsumer: React.FC = () => {
  const { currentUser, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{currentUser?.email ?? 'null'}</span>
    </div>
  );
};

function renderWithAuth() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authStateCallback = null;
});

// ─── 1. Estado inicial y loading ──────────────────────────────────────────────

describe('AuthProvider — estado inicial', () => {
  it('inicia con loading=true y sin usuario', () => {
    renderWithAuth();
    // Mientras authStateCallback no se invoca, loading queda en true
    // y el contenido de children no se renderiza ({!loading && children})
    expect(screen.queryByTestId('loading')).toBeNull();
  });

  it('pasa a loading=false y usuario null cuando onAuthStateChanged dispara con null', async () => {
    renderWithAuth();

    act(() => {
      authStateCallback?.(null);
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('null');
    });
  });

  it('actualiza currentUser cuando onAuthStateChanged dispara con un usuario', async () => {
    renderWithAuth();

    const mockUser = { email: 'test@example.com', uid: 'abc123' };

    act(() => {
      authStateCallback?.(mockUser);
    });

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    });
  });
});

// ─── 2. Métodos de autenticación ──────────────────────────────────────────────

describe('AuthProvider — métodos de autenticación', () => {
  /** Helper: renderiza y resuelve el estado inicial */
  async function setup() {
    let ctxRef: ReturnType<typeof useAuth> | null = null;

    const Capturer: React.FC = () => {
      ctxRef = useAuth();
      return null;
    };

    render(
      <AuthProvider>
        <Capturer />
      </AuthProvider>
    );

    // Resolver el estado inicial
    act(() => { authStateCallback?.(null); });
    await waitFor(() => expect(ctxRef?.loading).toBe(false));

    return ctxRef!;
  }

  it('login: llama a signInWithEmailAndPassword con email y password', async () => {
    mockSignIn.mockResolvedValueOnce({ user: { email: 'a@b.com' } });
    const ctx = await setup();

    await ctx.login('a@b.com', 'secret123');

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith(
      { name: 'mock-auth' },
      'a@b.com',
      'secret123'
    );
  });

  it('register: llama a createUserWithEmailAndPassword con email y password', async () => {
    mockCreateUser.mockResolvedValueOnce({ user: { email: 'nuevo@test.com' } });
    const ctx = await setup();

    await ctx.register('nuevo@test.com', 'miPass456');

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledWith(
      { name: 'mock-auth' },
      'nuevo@test.com',
      'miPass456'
    );
  });

  it('logout: llama a signOut con la instancia de auth', async () => {
    mockSignOut.mockResolvedValueOnce(undefined);
    const ctx = await setup();

    await ctx.logout();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ name: 'mock-auth' });
  });

  it('resetPassword: llama a sendPasswordResetEmail con email', async () => {
    mockSendPasswordReset.mockResolvedValueOnce(undefined);
    const ctx = await setup();

    await ctx.resetPassword('recuperar@test.com');

    expect(mockSendPasswordReset).toHaveBeenCalledTimes(1);
    expect(mockSendPasswordReset).toHaveBeenCalledWith(
      { name: 'mock-auth' },
      'recuperar@test.com'
    );
  });

  it('login: propaga el error cuando las credenciales son inválidas', async () => {
    const authError = Object.assign(new Error('Invalid credentials'), {
      code: 'auth/invalid-credential',
    });
    mockSignIn.mockRejectedValueOnce(authError);
    const ctx = await setup();

    await expect(ctx.login('x@y.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });
});
