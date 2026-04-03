#!/usr/bin/env node

const { createServer } = require('./server');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
claude-spend - 查看你的 Claude Code token 都花在了哪里

用法：
  claude-spend [选项]

选项：
  --port <端口>   仪表盘运行端口（默认：3456）
  --no-open       不自动打开浏览器
  --help, -h      显示此帮助信息

示例：
  npx claude-spend          在浏览器中打开仪表盘
  claude-spend --port 8080  使用自定义端口
`);
  process.exit(0);
}

const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3456;
const noOpen = args.includes('--no-open');

if (isNaN(port)) {
  console.error('错误：--port 必须是数字');
  process.exit(1);
}

const app = createServer();

const server = app.listen(port, async () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  claude-spend 仪表盘运行于 ${url}\n`);

  if (!noOpen) {
    try {
      const open = (await import('open')).default;
      await open(url);
    } catch {
      console.log('  无法自动打开浏览器，请手动打开 URL。');
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，请尝试 --port <其他端口>`);
    process.exit(1);
  }
  throw err;
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n  正在关闭...');
  server.close();
  process.exit(0);
});
