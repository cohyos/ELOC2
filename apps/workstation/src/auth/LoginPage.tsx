import React, { useState, useCallback } from 'react';
import { useAuthStore } from './auth-store';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthStore(s => s.login);
  const error = useAuthStore(s => s.error);
  const isLoading = useAuthStore(s => s.isLoading);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    await login(username.trim(), password);
  }, [username, password, login]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0d0d1a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#141425',
        border: '1px solid #2a2a3e',
        borderRadius: '8px',
        padding: '40px',
        width: '360px',
        maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '3px',
            marginBottom: '6px',
          }}>ELOC2</div>
          <div style={{
            fontSize: '12px',
            color: '#888',
            letterSpacing: '0.5px',
          }}>EO C2 Air Defense Demonstrator</div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: '#331111',
            border: '1px solid #ff333344',
            borderRadius: '4px',
            padding: '8px 12px',
            marginBottom: '16px',
            color: '#ff6666',
            fontSize: '13px',
          }}>{error}</div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '6px',
            }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#1a1a2e',
                border: '1px solid #2a2a3e',
                borderRadius: '4px',
                color: '#e0e0e0',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '6px',
            }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#1a1a2e',
                border: '1px solid #2a2a3e',
                borderRadius: '4px',
                color: '#e0e0e0',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            style={{
              width: '100%',
              padding: '10px',
              background: isLoading ? '#333' : '#4a9eff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: (isLoading || !username.trim() || !password.trim()) ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
