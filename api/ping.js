module.exports = async (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(
    JSON.stringify({
      ok: true,
      now: new Date().toISOString(),
      hasDatabaseEnv: Boolean(String(process.env.DATABASE_URL || '').trim()),
      commit: String(process.env.VERCEL_GIT_COMMIT_SHA || ''),
      ref: String(process.env.VERCEL_GIT_COMMIT_REF || ''),
      deployment: String(process.env.VERCEL_DEPLOYMENT_ID || '')
    })
  );
};

