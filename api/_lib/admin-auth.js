const COOKIE_NAME = 'luxe_admin_session';

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

const getCookieValue = (req, name) => {
  const cookies = parseCookies(req.headers?.cookie || req.headers?.Cookie || '');
  return cookies[name] || '';
};

const isAdminSessionValid = (req) => {
  const expectedToken = getExpectedSessionToken();
  if (!expectedToken) return false;
  return getCookieValue(req, COOKIE_NAME) === expectedToken;
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
  getExpectedSessionToken,
  isAdminSessionValid,
  isLoginConfigured,
  shouldUseSecureCookie,
  requireAdminAuth
};
