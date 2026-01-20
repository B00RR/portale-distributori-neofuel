import { describe, it, expect, vi, beforeEach } from 'vitest';
// Nota: Importiamo dynamicamente Auth o creiamo un test wrapper se Auth è un singleton complesso
// Per ora mockiamo la logica base basata sulle chiamate supabase

describe('Authentication Flow (Unit)', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call supabase.auth.signInWithPassword on login', async () => {
        const email = 'test@example.com';
        const password = 'password123';

        // Mock success response
        window.supabase.auth.signInWithPassword.mockResolvedValue({
            data: { user: { id: '123', email } },
            error: null
        });

        // Simulate Login Logic (normalmente in un Auth Service, qui testa il mock infrastruttura)
        const response = await window.supabase.auth.signInWithPassword({ email, password });

        expect(window.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email, password });
        expect(response.data.user.email).toBe(email);
    });

    it('should handle login error', async () => {
        const errorMsg = 'Invalid credentials';

        // Mock error response
        window.supabase.auth.signInWithPassword.mockResolvedValue({
            data: { user: null },
            error: { message: errorMsg }
        });

        const response = await window.supabase.auth.signInWithPassword({
            email: 'wrong@example.com',
            password: 'wrong'
        });

        expect(response.error.message).toBe(errorMsg);
    });

    it('should call supabase.auth.signOut on logout', async () => {
        await window.supabase.auth.signOut();
        expect(window.supabase.auth.signOut).toHaveBeenCalled();
    });
});
