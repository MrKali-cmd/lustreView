const ADMIN_COOKIE_NAME = 'luxe_admin_session';
const LOGIN_PATH = '/portal-7f3a9c/';
const LEGACY_ADMIN_PREFIXES = [
  '/admin/tailadmin-free-tailwind-dashboard-template-main/src/',
  '/admin/tailadmin-free-tailwind-dashboard-template-main/build/'
];

const getExpectedToken = () => String(process.env.ADMIN_SESSION_TOKEN || '').trim();

const parseCookies = (value) =>
  String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf('=');
      if (index < 0) return acc;
      const key = part.slice(0, index).trim();
      const cookieValue = part.slice(index + 1).trim();
      acc[key] = decodeURIComponent(cookieValue);
      return acc;
    }, {});

const getCookie = (headerValue, name) => parseCookies(headerValue)[name] || '';

const isAuthorized = (request) => {
  const expectedToken = getExpectedToken();
  if (!expectedToken) return false;
  const cookieValue = getCookie(request.headers.get('cookie'), ADMIN_COOKIE_NAME);
  return cookieValue === expectedToken;
};

export function middleware(request) {
  const url = new URL(request.url);
  const { pathname } = url;

  // Canonicalize host: force apex -> www to avoid cookie/session splitting.
  // This fixes "reads work but mutations fail" when admin logs in on one host
  // and admin panel/API calls happen on the other host.
  if (url.hostname === 'lustreview.com') {
    url.hostname = 'www.lustreview.com';
    return Response.redirect(url, 308);
  }

  if (!pathname.startsWith('/admin')) {
    return;
  }

  if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index.html' || pathname === '/admin/login.html') {
    return new Response('Not found', { status: 404 });
  }

  if (pathname === LOGIN_PATH || pathname === '/portal-7f3a9c/index.html') {
    if (isAuthorized(request)) {
      const next = url.searchParams.get('next');
      const target = next && next.startsWith('/admin')
        ? next
        : '/admin/panel/index.html';
      return Response.redirect(new URL(target, url), 302);
    }

    return;
  }

  const legacyPrefix = LEGACY_ADMIN_PREFIXES.find((prefix) => pathname.startsWith(prefix));
  if (legacyPrefix) {
    if (!isAuthorized(request)) {
      return new Response('Not found', { status: 404 });
    }

    const targetPath = pathname.replace(legacyPrefix, '/admin/panel/');
    return Response.redirect(new URL(targetPath, url), 302);
  }

  if (!isAuthorized(request)) {
    return new Response('Not found', { status: 404 });
  }

  return;
}

export const config = {
  matcher: ['/:path*']
};
