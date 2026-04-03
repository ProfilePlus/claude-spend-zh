const express = require('express');
const path = require('path');
function createServer() {
  const app = express();

  // Cache parsed data (reparse on demand via refresh endpoint)
  let cachedData = null;

  function friendlyError(err) {
    const msg = err.message || String(err);
    if (err.code === 'ENOENT') return { error: '未找到 Claude Code 数据目录。你是否已经使用过 Claude Code？', code: 'ENOENT' };
    if (err.code === 'EPERM' || err.code === 'EACCES') return { error: '读取 Claude Code 数据时权限不足。请尝试提升权限运行。', code: err.code };
    return { error: msg };
  }

  app.get('/api/data', async (req, res) => {
    try {
      if (!cachedData) {
        cachedData = await require('./parser').parseAllSessions();
      }
      res.json(cachedData);
    } catch (err) {
      res.status(500).json(friendlyError(err));
    }
  });

  app.get('/api/refresh', async (req, res) => {
    try {
      delete require.cache[require.resolve('./parser')];
      cachedData = await require('./parser').parseAllSessions();
      res.json({ ok: true, sessions: cachedData.sessions.length });
    } catch (err) {
      res.status(500).json(friendlyError(err));
    }
  });

  // Serve static dashboard
  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}

module.exports = { createServer };
