const ADMIN_COOKIE_NAME = 'luxe_admin_session';
const LOGIN_PATHS = new Set(['/admin', '/admin/', '/admin/index.html', '/admin/login.html']);

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
  const { pathname, search } = url;

  if (!pathname.startsWith('/admin')) {
    return;
  }

  if (LOGIN_PATHS.has(pathname)) {
    if (isAuthorized(request)) {
      const next = url.searchParams.get('next');
      const target = next && next.startsWith('/admin')
        ? next
        : '/admin/tailadmin-free-tailwind-dashboard-template-main/src/index.html';
      return Response.redirect(new URL(target, url), 302);
    }

    return;
  }

  if (!isAuthorized(request)) {
    const loginUrl = new URL('/admin/', url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return Response.redirect(loginUrl, 302);
  }

  return;
}

export const config = {
  matcher: ['/admin', '/admin/:path*']
};
