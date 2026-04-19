module.exports = async (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(
    JSON.stringify({
      ok: true,
      now: new Date().toISOString()
    })
  );
};

