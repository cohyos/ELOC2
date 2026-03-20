import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../auth/auth-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserManagementViewProps {
  onBack: () => void;
}

interface ConnectedUser {
  id: string;
  role: string;
  connectedAt: number;
}

interface RegisteredUser {
  id: string;
  username: string;
  role: string;
  enabled: boolean;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const colors = {
  bg: '#0d0d1a',
  panelBg: '#141425',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
  rowEven: '#141425',
  rowOdd: '#181830',
  danger: '#ff4444',
  success: '#00cc44',
};

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: colors.bg,
  color: colors.text,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 20px',
  background: '#1a1a2e',
  borderBottom: `1px solid ${colors.border}`,
};

const backBtnStyle: React.CSSProperties = {
  background: '#333',
  color: '#aaa',
  border: 'none',
  padding: '6px 14px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
};

const sectionStyle: React.CSSProperties = {
  margin: '24px 20px',
  background: colors.panelBg,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  overflow: 'hidden',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: `1px solid ${colors.border}`,
  fontSize: '14px',
  fontWeight: 600,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: 600,
  color: colors.textDim,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: `1px solid ${colors.border}`,
};

const tdStyle = (rowIdx: number): React.CSSProperties => ({
  padding: '8px 16px',
  borderBottom: `1px solid ${colors.border}22`,
  background: rowIdx % 2 === 0 ? colors.rowEven : colors.rowOdd,
});

const actionBtnStyle: React.CSSProperties = {
  background: '#333',
  color: '#aaa',
  border: 'none',
  padding: '4px 10px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '11px',
  marginRight: '6px',
};

const primaryBtnStyle: React.CSSProperties = {
  background: colors.accent,
  color: '#fff',
  border: 'none',
  padding: '6px 16px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  background: '#1a1a2e',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  padding: '6px 10px',
  fontSize: '13px',
  width: '100%',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserManagementView({ onBack }: UserManagementViewProps) {
  // Online users state
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);

  // Auth state
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'instructor' | 'operator'>('operator');
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'instructor' | 'operator'>('operator');
  const [editEnabled, setEditEnabled] = useState(true);

  // Delete confirmation
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Current auth user (to prevent self-delete)
  const currentUser = useAuthStore(s => s.user);

  // Fetch connected users
  const fetchConnectedUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/simulation/connected-users');
      if (res.ok) {
        const data = await res.json();
        setConnectedUsers(data.users ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Check auth status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          setAuthEnabled(data.enabled);
        }
      } catch {
        setAuthEnabled(false);
      }
    })();
  }, []);

  // Fetch registered users (only when auth enabled)
  const fetchRegisteredUsers = useCallback(async () => {
    if (!authEnabled) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setRegisteredUsers(Array.isArray(data) ? data : data.users ?? []);
        setError(null);
      } else {
        setError(`Failed to fetch users: ${res.status}`);
      }
    } catch (err) {
      setError('Failed to fetch registered users');
    } finally {
      setLoading(false);
    }
  }, [authEnabled]);

  // Poll connected users every 5 seconds
  useEffect(() => {
    fetchConnectedUsers();
    const interval = setInterval(fetchConnectedUsers, 5000);
    return () => clearInterval(interval);
  }, [fetchConnectedUsers]);

  // Fetch registered users on mount (if auth enabled)
  useEffect(() => {
    if (authEnabled) {
      fetchRegisteredUsers();
    }
  }, [authEnabled, fetchRegisteredUsers]);

  // Create user handler
  const handleCreateUser = async () => {
    setCreateError(null);
    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError('Username and password are required');
      return;
    }
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      if (res.ok) {
        setNewUsername('');
        setNewPassword('');
        setNewRole('operator');
        setShowCreateForm(false);
        setCreateError(null);
        fetchRegisteredUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || data.message || `Failed to create user (${res.status})`);
      }
    } catch {
      setCreateError('Network error creating user');
    }
  };

  // Update user handler
  const handleUpdateUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole, enabled: editEnabled }),
      });
      if (res.ok) {
        setEditingUserId(null);
        fetchRegisteredUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || data.message || `Failed to update user (${res.status})`);
      }
    } catch {
      setError('Network error updating user');
    }
  };

  // Delete user handler
  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/auth/users/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletingUserId(null);
        fetchRegisteredUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || data.message || `Failed to delete user (${res.status})`);
      }
    } catch {
      setError('Network error deleting user');
    }
  };

  const formatConnectedSince = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const roleBadge = (role: string) => {
    const roleColor = role === 'instructor' ? colors.accent : role === 'operator' ? '#ff8800' : colors.textDim;
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 600,
        background: `${roleColor}22`,
        color: roleColor,
        border: `1px solid ${roleColor}44`,
      }}>
        {role}
      </span>
    );
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <button style={backBtnStyle} onClick={onBack}>Back</button>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>User Management</h1>
      </header>

      {/* Error banner */}
      {error && (
        <div style={{ margin: '12px 20px', padding: '10px 16px', background: '#441111', border: `1px solid ${colors.danger}44`, borderRadius: '4px', color: colors.danger, fontSize: '13px' }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: '14px' }}>&times;</button>
        </div>
      )}

      {/* Section 1: Online Users */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span>Online Users ({connectedUsers.length})</span>
        </div>
        {connectedUsers.length === 0 ? (
          <div style={{ padding: '20px 16px', color: colors.textDim, fontSize: '13px', textAlign: 'center' }}>
            No users currently connected
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Connected Since</th>
              </tr>
            </thead>
            <tbody>
              {connectedUsers.map((user, idx) => (
                <tr key={user.id}>
                  <td style={tdStyle(idx)}>{idx + 1}</td>
                  <td style={tdStyle(idx)}>{roleBadge(user.role)}</td>
                  <td style={tdStyle(idx)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: colors.success }} />
                      Online
                    </span>
                  </td>
                  <td style={tdStyle(idx)}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{formatConnectedSince(user.connectedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section 2: Registered Users (auth enabled only) */}
      {authEnabled === null ? (
        <div style={{ ...sectionStyle, padding: '20px 16px', textAlign: 'center', color: colors.textDim }}>
          Checking auth status...
        </div>
      ) : authEnabled ? (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <span>Registered Users ({registeredUsers.length})</span>
            <button
              style={primaryBtnStyle}
              onClick={() => { setShowCreateForm(!showCreateForm); setCreateError(null); }}
            >
              {showCreateForm ? 'Cancel' : 'Create User'}
            </button>
          </div>

          {/* Create user form */}
          {showCreateForm && (
            <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}`, background: '#1a1a2e' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: colors.textDim, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Username</label>
                  <input
                    style={inputStyle}
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="Enter username"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: colors.textDim, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                  <input
                    style={inputStyle}
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter password"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: colors.textDim, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Role</label>
                  <select style={selectStyle} value={newRole} onChange={e => setNewRole(e.target.value as 'instructor' | 'operator')}>
                    <option value="operator">Operator</option>
                    <option value="instructor">Instructor</option>
                  </select>
                </div>
                <button style={{ ...primaryBtnStyle, height: '34px' }} onClick={handleCreateUser}>
                  Create
                </button>
              </div>
              {createError && (
                <div style={{ marginTop: '8px', color: colors.danger, fontSize: '12px' }}>{createError}</div>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: colors.textDim }}>Loading users...</div>
          ) : registeredUsers.length === 0 ? (
            <div style={{ padding: '20px 16px', color: colors.textDim, fontSize: '13px', textAlign: 'center' }}>
              No registered users
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Username</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Enabled</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {registeredUsers.map((user, idx) => {
                  const isEditing = editingUserId === user.id;
                  const isDeleting = deletingUserId === user.id;
                  const isSelf = currentUser?.id === user.id || currentUser?.username === user.username;

                  return (
                    <tr key={user.id}>
                      <td style={tdStyle(idx)}>
                        <span style={{ fontWeight: 500 }}>{user.username}</span>
                        {isSelf && <span style={{ marginLeft: '6px', fontSize: '10px', color: colors.accent }}>(you)</span>}
                      </td>
                      <td style={tdStyle(idx)}>
                        {isEditing ? (
                          <select style={{ ...selectStyle, width: 'auto' }} value={editRole} onChange={e => setEditRole(e.target.value as 'instructor' | 'operator')}>
                            <option value="operator">Operator</option>
                            <option value="instructor">Instructor</option>
                          </select>
                        ) : (
                          roleBadge(user.role)
                        )}
                      </td>
                      <td style={tdStyle(idx)}>
                        {isEditing ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={editEnabled} onChange={e => setEditEnabled(e.target.checked)} />
                            <span style={{ fontSize: '12px' }}>{editEnabled ? 'Enabled' : 'Disabled'}</span>
                          </label>
                        ) : (
                          <span style={{ color: user.enabled ? colors.success : colors.danger, fontWeight: 600, fontSize: '12px' }}>
                            {user.enabled ? 'Yes' : 'No'}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle(idx)}>
                        {isEditing ? (
                          <>
                            <button style={{ ...actionBtnStyle, background: colors.accent, color: '#fff' }} onClick={() => handleUpdateUser(user.id)}>Save</button>
                            <button style={actionBtnStyle} onClick={() => setEditingUserId(null)}>Cancel</button>
                          </>
                        ) : isDeleting ? (
                          <>
                            <span style={{ fontSize: '12px', color: colors.danger, marginRight: '8px' }}>Confirm delete?</span>
                            <button style={{ ...actionBtnStyle, background: colors.danger, color: '#fff' }} onClick={() => handleDeleteUser(user.id)}>Yes</button>
                            <button style={actionBtnStyle} onClick={() => setDeletingUserId(null)}>No</button>
                          </>
                        ) : (
                          <>
                            <button style={actionBtnStyle} onClick={() => { setEditingUserId(user.id); setEditRole(user.role as 'instructor' | 'operator'); setEditEnabled(user.enabled); }}>Edit</button>
                            {!isSelf && (
                              <button style={{ ...actionBtnStyle, color: colors.danger }} onClick={() => setDeletingUserId(user.id)}>Delete</button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ ...sectionStyle, padding: '20px 16px', textAlign: 'center', color: colors.textDim, fontSize: '13px' }}>
          Authentication is not enabled. Set <code style={{ color: colors.accent }}>AUTH_ENABLED=true</code> to manage registered users.
        </div>
      )}
    </div>
  );
}
