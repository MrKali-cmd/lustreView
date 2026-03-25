const fs = require('fs');
const os = require('os');
const path = require('path');

const COOKIE_NAME = 'luxe_admin_session';
const LOGIN_LOCK_FILE = path.join(os.tmpdir(), 'luxe-admin-login-locks.json');
const MAX_LOGIN_FAILURES = 3;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const getExpectedSessionToken = () => String(process.env.ADMIN_SESSION_TOKEN || '').trim();

const getAllowedLoginIds = () => {
  const values = [
    process.env.ADMIN_LOGIN_USER,
    process.env.ADMIN_USERNAME,
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_LOGIN_ID
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return Array.from(new Set(values));
};

const getConfiguredPassword = () =>
  String(process.env.ADMIN_PASSWORD || process.env.ADMIN_LOGIN_PASSWORD || '').trim();

const shouldUseSecureCookie = (req) => {
  const configured = String(process.env.ADMIN_COOKIE_SECURE || '').trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;

  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'] || '').toLowerCase();
  return forwardedProto.includes('https') || process.env.VERCEL === '1';
};

const parseCookies = (headerValue) => {
  const cookies = {};
  String(headerValue || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index < 0) return;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      cookies[name] = decodeURIComponent(value);
    });

  return cookies;
};

const loadLockState = () => {
  try {
    if (!fs.existsSync(LOGIN_LOCK_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(LOGIN_LOCK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveLockState = (state) => {
  try {
    fs.writeFileSync(LOGIN_LOCK_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Ignore lock-state persistence failures; auth still works in-memory for this request.
  }
};

const getClientIp = (req) => {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'] || '').trim();
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const direct =
    String(req?.headers?.['x-real-ip'] || req?.headers?.['X-Real-Ip'] || req?.socket?.remoteAddress || '').trim();

  return direct || 'unknown';
};

const getCookieValue = (req, name) => {
  const cookies = parseCookies(req.headers?.cookie || req.headers?.Cookie || '');
  return cookies[name] || '';
};

const isAdminSessionValid = (req) => {
  const expectedToken = getExpectedSessionToken();
  if (!expectedToken) return false;
  return getCookieValue(req, COOKIE_NAME) === expectedToken;
};

const getLoginLockState = (req) => {
  const ip = getClientIp(req);
  const state = loadLockState();
  const record = state[ip] || { failures: 0, lockedUntil: 0 };
  const lockedUntil = Number(record.lockedUntil || 0);

  if (lockedUntil && lockedUntil > Date.now()) {
    return {
      ip,
      failures: Number(record.failures || 0),
      lockedUntil
    };
  }

  if (lockedUntil && lockedUntil <= Date.now()) {
    delete state[ip];
    saveLockState(state);
  }

  return {
    ip,
    failures: 0,
    lockedUntil: 0
  };
};

const isLoginBlocked = (req) => {
  const lock = getLoginLockState(req);
  return lock.lockedUntil > Date.now();
};

const getLoginBlockedMessage = (req) => {
  const lock = getLoginLockState(req);
  if (!lock.lockedUntil || lock.lockedUntil <= Date.now()) {
    return '';
  }

  const minutes = Math.max(1, Math.ceil((lock.lockedUntil - Date.now()) / 60000));
  return `Too many failed login attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
};

const recordFailedLoginAttempt = (req) => {
  const ip = getClientIp(req);
  const state = loadLockState();
  const record = state[ip] || { failures: 0, lockedUntil: 0 };
  const failures = Number(record.failures || 0) + 1;

  if (failures >= MAX_LOGIN_FAILURES) {
    state[ip] = {
      failures,
      lockedUntil: Date.now() + LOGIN_LOCK_MS
    };
  } else {
    state[ip] = {
      failures,
      lockedUntil: 0
    };
  }

  saveLockState(state);

  return state[ip];
};

const clearFailedLoginAttempts = (req) => {
  const ip = getClientIp(req);
  const state = loadLockState();
  if (state[ip]) {
    delete state[ip];
    saveLockState(state);
  }
};

const requireAdminAuth = (req, res) => {
  if (isAdminSessionValid(req)) {
    return true;
  }

  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
};

const buildSessionCookie = (req) => {
  const token = getExpectedSessionToken();
  if (!token) return '';

  const secure = shouldUseSecureCookie(req);
  const maxAge = 60 * 60 * 24 * 7;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

const clearSessionCookie = (req) => {
  const secure = shouldUseSecureCookie(req);
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

const isLoginConfigured = () => getAllowedLoginIds().length > 0 && getConfiguredPassword().length > 0 && getExpectedSessionToken().length > 0;

const credentialsMatch = (identifier, password) => {
  const loginIds = getAllowedLoginIds();
  const configuredPassword = getConfiguredPassword();
  const normalizedIdentifier = String(identifier || '').trim();
  const normalizedPassword = String(password || '').trim();

  if (!loginIds.length || !configuredPassword) return false;

  return loginIds.includes(normalizedIdentifier) && normalizedPassword === configuredPassword;
};

module.exports = {
  COOKIE_NAME,
  buildSessionCookie,
  clearSessionCookie,
  credentialsMatch,
  clearFailedLoginAttempts,
  getExpectedSessionToken,
  getLoginBlockedMessage,
  isLoginBlocked,
  isAdminSessionValid,
  isLoginConfigured,
  recordFailedLoginAttempt,
  shouldUseSecureCookie,
  requireAdminAuth
};
