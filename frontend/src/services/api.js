const rawApiUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl.replace(/\/$/, '')}/api`)
  : '/api';

export function getActiveToken() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname || '';
  const isAdminPath = path.startsWith('/admin') || path.startsWith('/controller');
  const isTeamPath = path.startsWith('/user');

  const adminToken = localStorage.getItem('glitch_admin_token') || localStorage.getItem('glitch_token');
  const teamToken = localStorage.getItem('glitch_team_token');

  if (isAdminPath) {
    return adminToken || teamToken || null;
  }
  if (isTeamPath) {
    return teamToken || adminToken || null;
  }
  return adminToken || teamToken || null;
}

function getAuthHeader() {
  const token = getActiveToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(endpoint, options = {}) {
  const authHeaders = getAuthHeader();
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      let userRole = null;
      try {
        const stored = localStorage.getItem('glitch_user');
        if (stored) userRole = JSON.parse(stored).role;
      } catch (e) {}

      const isTokenIssue = data.code === 'TOKEN_EXPIRED' ||
                           data.code === 'TOKEN_INVALID' ||
                           data.message === 'Invalid or expired token.' ||
                           data.message === 'Authentication required. No token provided.' ||
                           Boolean(authHeaders.Authorization);

      const userFriendlyMessage = (userRole === 'admin_1' || userRole === 'admin_2')
        ? 'Admin session expired. Please log in again.'
        : 'Session expired. Please log in again.';

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('glitch:auth_expired', {
          detail: {
            role: userRole,
            message: userFriendlyMessage,
            endpoint,
            status: 401
          }
        }));
      }

      throw new Error(isTokenIssue ? userFriendlyMessage : (data.message || userFriendlyMessage));
    }

    throw new Error(data.message || `Request failed with status ${response.status}`);
  }
  return data;
}

export const api = {
  // Auth
  loginAdmin: (username, password) => request('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  }),
  loginTeam: (username, password) => request('/auth/team/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  }),
  getMe: () => request('/auth/me'),

  // Teams
  getTeams: (isTest, search) => {
    const params = new URLSearchParams();
    if (isTest !== undefined && isTest !== null) params.append('isTest', isTest);
    if (search) params.append('search', search);
    return request(`/teams?${params.toString()}`);
  },
  getTeam: (id) => request(`/teams/${id}`),
  createTeam: (data) => request('/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id, data) => request(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeam: (id) => request(`/teams/${id}`, { method: 'DELETE' }),
  resetTeamCredentials: (id) => request(`/teams/${id}/reset`, { method: 'POST' }),
  toggleTeamStatus: (id, status) => request(`/teams/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  bulkGenerateTestTeams: (count) => request('/teams/bulk-test', { method: 'POST', body: JSON.stringify({ count }) }),
  clearTestTeams: () => request('/teams/clear-test', { method: 'POST' }),

  // Questions
  getQuestions: () => request('/questions'),
  getQuestionsByRound: (roundId) => request(`/questions/round/${roundId}`),
  getQuestion: (id) => request(`/questions/${id}`),
  createQuestion: (data) => request('/questions', { method: 'POST', body: JSON.stringify(data) }),
  createQuestionVersion: (id, data) => request(`/questions/${id}/version`, { method: 'POST', body: JSON.stringify(data) }),
  updateQuestion: (id, data) => request(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQuestion: (id) => request(`/questions/${id}`, { method: 'DELETE' }),
  toggleQuestionStatus: (id, is_active) => request(`/questions/${id}/status`, { method: 'POST', body: JSON.stringify({ is_active }) }),
  reorderQuestions: (orders) => request('/questions/reorder', { method: 'POST', body: JSON.stringify({ orders }) }),

  // Rounds
  getRounds: () => request('/rounds'),
  getRound: (id) => request(`/rounds/${id}`),
  createRound: (data) => request('/rounds', { method: 'POST', body: JSON.stringify(data) }),
  updateRound: (id, data) => request(`/rounds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRound: (id, force = false) => request(`/rounds/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
  toggleRoundStatus: (id, is_enabled) => request(`/rounds/${id}/status`, { method: 'POST', body: JSON.stringify({ is_enabled }) }),

  // Results & Date-Wise Event History
  getLeaderboard: (roundId) => {
    const url = roundId ? `/results/leaderboard?roundId=${roundId}` : '/results/leaderboard';
    return request(url);
  },
  getExportUrl: () => `${API_BASE}/results/export?token=${localStorage.getItem('glitch_admin_token') || localStorage.getItem('glitch_token') || ''}`,
  getEventRuns: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return request(`/events${q ? '?' + q : ''}`);
  },
  getTodayEvent: () => request('/events/today'),
  getEventRunDetails: (eventRunId) => request(`/events/${eventRunId}`),
  getRoundResultDetails: (eventRunId, roundId) => request(`/events/${eventRunId}/round/${roundId}`),
  createEventRun: (data) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  completeEventRun: (eventRunId) => request(`/events/${eventRunId}/complete`, { method: 'POST' }),
  getEventExportUrl: (eventRunId) => `${API_BASE}/events/${eventRunId}/export?token=${localStorage.getItem('glitch_admin_token') || localStorage.getItem('glitch_token') || ''}`,

  // Live Real-Time Event Monitoring (Read-Only)
  getLiveOverview: () => request('/live/overview'),
  getLiveRoundDetails: (roundId) => request(`/live/round/${roundId}`),

  // Settings & System
  getSettings: () => request('/settings'),
  updateSettings: (settings) => request('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  toggleTestingMode: (enabled) => request('/settings/testing-mode', { method: 'POST', body: JSON.stringify({ enabled }) }),
  getHealth: () => request('/settings/health'),
  getAuditLogs: (limit) => request(`/settings/audit-logs?limit=${limit || 50}`),
  getViolations: (limit) => request(`/settings/violations?limit=${limit || 50}`)
};
