const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Anthropic API pricing per token (from platform.claude.com/docs/en/about-claude/pricing)
// Note: These are API-equivalent estimates. Claude Code subscription pricing differs.
// Cache write = 1.25x base input (5-min TTL). Cache read = 0.1x base input.
const MODEL_PRICING = {
  // Opus 4.5, 4.6: $5/MTok in, $25/MTok out
  'opus-4.5': { input: 5 / 1e6, output: 25 / 1e6, cacheWrite: 6.25 / 1e6, cacheRead: 0.50 / 1e6 },
  'opus-4.6': { input: 5 / 1e6, output: 25 / 1e6, cacheWrite: 6.25 / 1e6, cacheRead: 0.50 / 1e6 },
  // Opus 4.0, 4.1: $15/MTok in, $75/MTok out
  'opus-4.0': { input: 15 / 1e6, output: 75 / 1e6, cacheWrite: 18.75 / 1e6, cacheRead: 1.50 / 1e6 },
  'opus-4.1': { input: 15 / 1e6, output: 75 / 1e6, cacheWrite: 18.75 / 1e6, cacheRead: 1.50 / 1e6 },
  // Sonnet 3.7, 4, 4.5, 4.6: $3/MTok in, $15/MTok out
  sonnet: { input: 3 / 1e6, output: 15 / 1e6, cacheWrite: 3.75 / 1e6, cacheRead: 0.30 / 1e6 },
  // Haiku 4.5: $1/MTok in, $5/MTok out
  'haiku-4.5': { input: 1 / 1e6, output: 5 / 1e6, cacheWrite: 1.25 / 1e6, cacheRead: 0.10 / 1e6 },
  // Haiku 3.5: $0.80/MTok in, $4/MTok out
  'haiku-3.5': { input: 0.80 / 1e6, output: 4 / 1e6, cacheWrite: 1.00 / 1e6, cacheRead: 0.08 / 1e6 },
};
const DEFAULT_PRICING = MODEL_PRICING.sonnet;

function getPricing(model) {
  if (!model) return DEFAULT_PRICING;
  const m = model.toLowerCase();
  if (m.includes('opus')) {
    // Opus 4.5/4.6 are cheaper than Opus 4.0/4.1
    if (m.includes('4-6') || m.includes('4.6')) return MODEL_PRICING['opus-4.6'];
    if (m.includes('4-5') || m.includes('4.5')) return MODEL_PRICING['opus-4.5'];
    if (m.includes('4-1') || m.includes('4.1')) return MODEL_PRICING['opus-4.1'];
    return MODEL_PRICING['opus-4.0']; // Opus 4.0 and Opus 3
  }
  if (m.includes('sonnet')) return MODEL_PRICING.sonnet;
  if (m.includes('haiku')) {
    if (m.includes('4-5') || m.includes('4.5')) return MODEL_PRICING['haiku-4.5'];
    return MODEL_PRICING['haiku-3.5'];
  }
  return DEFAULT_PRICING;
}

function getClaudeDir() {
  return path.join(os.homedir(), '.claude');
}

async function parseJSONLFile(filePath) {
  const lines = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line));
    } catch {
      // Skip malformed lines silently — user can't act on this
    }
  }
  return lines;
}

function extractSessionData(entries) {
  const queries = [];
  let pendingUserMessage = null;

  for (const entry of entries) {
    if (entry.type === 'user' && entry.message?.role === 'user') {
      const content = entry.message.content;
      if (entry.isMeta) continue;
      if (typeof content === 'string' && (
        content.startsWith('<local-command') ||
        content.startsWith('<command-name')
      )) continue;

      const textContent = typeof content === 'string'
        ? content
        : content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      pendingUserMessage = {
        text: textContent || null,
        timestamp: entry.timestamp,
      };
    }

    if (entry.type === 'assistant' && entry.message?.usage) {
      const usage = entry.message.usage;
      const model = entry.message.model || 'unknown';
      if (model === '<synthetic>') continue;

      const pricing = getPricing(model);
      const inputTokens = usage.input_tokens || 0;
      const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
      const cacheReadTokens = usage.cache_read_input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const totalTokens = inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens;
      const cost = (inputTokens * pricing.input)
        + (cacheCreationTokens * pricing.cacheWrite)
        + (cacheReadTokens * pricing.cacheRead)
        + (outputTokens * pricing.output);

      const tools = [];
      if (Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use' && block.name) tools.push(block.name);
        }
      }

      queries.push({
        userPrompt: pendingUserMessage?.text || null,
        userTimestamp: pendingUserMessage?.timestamp || null,
        assistantTimestamp: entry.timestamp,
        model,
        inputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        outputTokens,
        totalTokens,
        cost,
        tools,
      });
    }
  }

  return queries;
}

async function parseAllSessions() {
  const claudeDir = getClaudeDir();
  const projectsDir = path.join(claudeDir, 'projects');
  const warnings = [];

  if (!fs.existsSync(claudeDir)) {
    return { sessions: [], dailyUsage: [], modelBreakdown: [], topPrompts: [], totals: {}, warnings: [{ type: 'missing-dir', message: '未在 ' + claudeDir + ' 找到 Claude Code 数据目录。你是否已经使用过 Claude Code？' }] };
  }

  if (!fs.existsSync(projectsDir)) {
    return { sessions: [], dailyUsage: [], modelBreakdown: [], topPrompts: [], totals: {}, warnings: [{ type: 'no-projects', message: '未找到项目数据。请开始一个 Claude Code 对话来生成使用数据。' }] };
  }

  // Read history.jsonl for prompt display text
  const historyPath = path.join(claudeDir, 'history.jsonl');
  const historyEntries = fs.existsSync(historyPath) ? await parseJSONLFile(historyPath) : [];

  // Build a map: sessionId -> first meaningful prompt
  const sessionFirstPrompt = {};
  for (const entry of historyEntries) {
    if (entry.sessionId && entry.display && !sessionFirstPrompt[entry.sessionId]) {
      const display = entry.display.trim();
      if (display.startsWith('/') && display.length < 30) continue;
      sessionFirstPrompt[entry.sessionId] = display;
    }
  }

  const projectDirs = fs.readdirSync(projectsDir).filter(d => {
    try {
      return fs.statSync(path.join(projectsDir, d)).isDirectory();
    } catch {
      return false;
    }
  });

  const sessions = [];
  const dailyMap = {};
  const modelMap = {};
  const allPrompts = []; // for "most expensive prompts" across all sessions

  for (const projectDir of projectDirs) {
    const dir = path.join(projectsDir, projectDir);
    let files;
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue; // Skip directories we can't read
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      const sessionId = path.basename(file, '.jsonl');

      let entries;
      try {
        entries = await parseJSONLFile(filePath);
      } catch {
        continue;
      }
      if (entries.length === 0) continue;

      const queries = extractSessionData(entries);
      if (queries.length === 0) continue;

      let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0, cost = 0;
      for (const q of queries) {
        inputTokens += q.inputTokens;
        outputTokens += q.outputTokens;
        cacheCreationTokens += q.cacheCreationTokens;
        cacheReadTokens += q.cacheReadTokens;
        cost += q.cost;
      }
      const totalTokens = inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens;

      const firstTimestamp = entries.find(e => e.timestamp)?.timestamp;
      const date = firstTimestamp ? (() => {
        const d = new Date(firstTimestamp);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        // Use local time to get the date in Asia/Shanghai timezone
        return `${year}-${month}-${day}`;
      })() : 'unknown';

      // Primary model
      const modelCounts = {};
      for (const q of queries) {
        modelCounts[q.model] = (modelCounts[q.model] || 0) + 1;
      }
      const primaryModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

      const firstPrompt = sessionFirstPrompt[sessionId]
        || queries.find(q => q.userPrompt)?.userPrompt
        || '(无提示词)';

      // Collect per-prompt data for "most expensive prompts"
      // Group consecutive queries under the same user prompt
      let currentPrompt = null;
      let promptInput = 0, promptOutput = 0, promptCacheCreation = 0, promptCacheRead = 0, promptCost = 0;
      const flushPrompt = () => {
        if (currentPrompt && (promptInput + promptOutput + promptCacheCreation + promptCacheRead) > 0) {
          allPrompts.push({
            prompt: currentPrompt.substring(0, 300),
            inputTokens: promptInput,
            outputTokens: promptOutput,
            cacheCreationTokens: promptCacheCreation,
            cacheReadTokens: promptCacheRead,
            totalTokens: promptInput + promptOutput + promptCacheCreation + promptCacheRead,
            cost: promptCost,
            date,
            sessionId,
            model: primaryModel,
          });
        }
      };
      for (const q of queries) {
        if (q.userPrompt && q.userPrompt !== currentPrompt) {
          flushPrompt();
          currentPrompt = q.userPrompt;
          promptInput = 0;
          promptOutput = 0;
          promptCacheCreation = 0;
          promptCacheRead = 0;
          promptCost = 0;
        }
        promptInput += q.inputTokens;
        promptOutput += q.outputTokens;
        promptCacheCreation += q.cacheCreationTokens;
        promptCacheRead += q.cacheReadTokens;
        promptCost += q.cost;
      }
      flushPrompt();

      sessions.push({
        sessionId,
        project: projectDir,
        date,
        timestamp: firstTimestamp,
        firstPrompt: firstPrompt.substring(0, 200),
        model: primaryModel,
        queryCount: queries.length,
        queries,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        totalTokens,
        cost,
      });

      // Daily
      if (date !== 'unknown') {
        if (!dailyMap[date]) {
          dailyMap[date] = { date, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, cost: 0, sessions: 0, queries: 0 };
        }
        dailyMap[date].inputTokens += inputTokens;
        dailyMap[date].outputTokens += outputTokens;
        dailyMap[date].cacheCreationTokens += cacheCreationTokens;
        dailyMap[date].cacheReadTokens += cacheReadTokens;
        dailyMap[date].totalTokens += totalTokens;
        dailyMap[date].cost += cost;
        dailyMap[date].sessions += 1;
        dailyMap[date].queries += queries.length;
      }

      // Model
      for (const q of queries) {
        if (q.model === '<synthetic>' || q.model === 'unknown') continue;
        if (!modelMap[q.model]) {
          modelMap[q.model] = { model: q.model, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, cost: 0, queryCount: 0 };
        }
        modelMap[q.model].inputTokens += q.inputTokens;
        modelMap[q.model].outputTokens += q.outputTokens;
        modelMap[q.model].cacheCreationTokens += q.cacheCreationTokens;
        modelMap[q.model].cacheReadTokens += q.cacheReadTokens;
        modelMap[q.model].totalTokens += q.totalTokens;
        modelMap[q.model].cost += q.cost;
        modelMap[q.model].queryCount += 1;
      }
    }
  }

  sessions.sort((a, b) => b.totalTokens - a.totalTokens);

  // Build per-project aggregation
  const projectMap = {};
  for (const session of sessions) {
    const proj = session.project;
    if (!projectMap[proj]) {
      projectMap[proj] = {
        project: proj,
        inputTokens: 0, outputTokens: 0, totalTokens: 0,
        sessionCount: 0, queryCount: 0,
        modelMap: {},
        allPrompts: [],
      };
    }
    const p = projectMap[proj];
    p.inputTokens += session.inputTokens;
    p.outputTokens += session.outputTokens;
    p.totalTokens += session.totalTokens;
    p.sessionCount += 1;
    p.queryCount += session.queryCount;

    for (const q of session.queries) {
      if (q.model === '<synthetic>' || q.model === 'unknown') continue;
      if (!p.modelMap[q.model]) {
        p.modelMap[q.model] = { model: q.model, inputTokens: 0, outputTokens: 0, totalTokens: 0, queryCount: 0 };
      }
      const m = p.modelMap[q.model];
      m.inputTokens += q.inputTokens;
      m.outputTokens += q.outputTokens;
      m.totalTokens += q.totalTokens;
      m.queryCount += 1;
    }

    // Per-project prompt grouping with tool tracking
    let curPrompt = null, curInput = 0, curOutput = 0, curConts = 0;
    let curModels = {}, curTools = {};
    const flushProjectPrompt = () => {
      if (curPrompt && (curInput + curOutput) > 0) {
        const topModel = Object.entries(curModels).sort((a, b) => b[1] - a[1])[0]?.[0] || session.model;
        p.allPrompts.push({
          prompt: curPrompt.substring(0, 300),
          inputTokens: curInput,
          outputTokens: curOutput,
          totalTokens: curInput + curOutput,
          continuations: curConts,
          model: topModel,
          toolCounts: { ...curTools },
          date: session.date,
          sessionId: session.sessionId,
        });
      }
    };
    for (const q of session.queries) {
      if (q.userPrompt && q.userPrompt !== curPrompt) {
        flushProjectPrompt();
        curPrompt = q.userPrompt;
        curInput = 0; curOutput = 0; curConts = 0;
        curModels = {}; curTools = {};
      } else if (!q.userPrompt) {
        curConts++;
      }
      curInput += q.inputTokens;
      curOutput += q.outputTokens;
      if (q.model && q.model !== '<synthetic>') curModels[q.model] = (curModels[q.model] || 0) + 1;
      for (const t of q.tools || []) curTools[t] = (curTools[t] || 0) + 1;
    }
    flushProjectPrompt();
  }

  const projectBreakdown = Object.values(projectMap).map(p => ({
    project: p.project,
    inputTokens: p.inputTokens,
    outputTokens: p.outputTokens,
    totalTokens: p.totalTokens,
    sessionCount: p.sessionCount,
    queryCount: p.queryCount,
    modelBreakdown: Object.values(p.modelMap).sort((a, b) => b.totalTokens - a.totalTokens),
    topPrompts: (p.allPrompts || []).sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 10),
  })).sort((a, b) => b.totalTokens - a.totalTokens);

  const dailyUsage = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // Top 20 most expensive individual prompts
  allPrompts.sort((a, b) => b.totalTokens - a.totalTokens);
  const topPrompts = allPrompts.slice(0, 20);

  const totalCacheCreationTokens = sessions.reduce((sum, s) => sum + s.cacheCreationTokens, 0);
  const totalCacheReadTokens = sessions.reduce((sum, s) => sum + s.cacheReadTokens, 0);
  const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0);
  const totalAllInput = sessions.reduce((sum, s) => sum + s.inputTokens + s.cacheCreationTokens + s.cacheReadTokens, 0);

  // What caching saved: cache reads at full input price minus what they actually cost
  const avgInputPrice = DEFAULT_PRICING.input;
  const avgCacheReadPrice = DEFAULT_PRICING.cacheRead;
  const totalSaved = totalCacheReadTokens * (avgInputPrice - avgCacheReadPrice);
  const cacheHitRate = totalAllInput > 0 ? totalCacheReadTokens / totalAllInput : 0;

  const grandTotals = {
    totalSessions: sessions.length,
    totalQueries: sessions.reduce((sum, s) => sum + s.queryCount, 0),
    totalTokens: sessions.reduce((sum, s) => sum + s.totalTokens, 0),
    totalInputTokens: sessions.reduce((sum, s) => sum + s.inputTokens, 0),
    totalOutputTokens: sessions.reduce((sum, s) => sum + s.outputTokens, 0),
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalCost,
    totalSaved,
    cacheHitRate,
    avgTokensPerQuery: 0,
    avgTokensPerSession: 0,
    dateRange: dailyUsage.length > 0
      ? { from: dailyUsage[0].date, to: dailyUsage[dailyUsage.length - 1].date }
      : null,
  };
  if (grandTotals.totalQueries > 0) {
    grandTotals.avgTokensPerQuery = Math.round(grandTotals.totalTokens / grandTotals.totalQueries);
  }
  if (grandTotals.totalSessions > 0) {
    grandTotals.avgTokensPerSession = Math.round(grandTotals.totalTokens / grandTotals.totalSessions);
  }

  // Generate insights
  const insights = generateInsights(sessions, allPrompts, grandTotals);

  return {
    sessions,
    dailyUsage,
    modelBreakdown: Object.values(modelMap),
    projectBreakdown,
    topPrompts,
    totals: grandTotals,
    insights,
    warnings,
  };
}

function generateInsights(sessions, allPrompts, totals) {
  const insights = [];

  // 1. Short, vague messages that cost a lot
  const shortExpensive = allPrompts.filter(p => p.prompt.trim().length < 30 && p.totalTokens > 100_000);
  if (shortExpensive.length > 0) {
    const totalWasted = shortExpensive.reduce((s, p) => s + p.totalTokens, 0);
    const examples = [...new Set(shortExpensive.map(p => p.prompt.trim()))].slice(0, 4);
    insights.push({
      id: 'vague-prompts',
      type: 'warning',
      title: '简短模糊的消息消耗最高',
      description: `${shortExpensive.length} 次你发送了类似 ${examples.map(e => '"' + e + '"').join(', ')} 的短消息，每条消息都至少消耗 100K token 来揣测你的意图。在所有 ${shortExpensive.length} 条消息中，总共消耗了 ${fmt(totalWasted)} token -- 都花在了重新读取对话、搜索文件和多次尝试理解模糊指令上。`,
      action: '尝试更具体地表达。与其说"是的"，不如说"是的，更新登录页面并运行测试"。明确的指令让 Claude 有清晰的目标，完成更快，消耗更少。',
    });
  }

  // 2. Long conversations getting more expensive over time
  const longSessions = sessions.filter(s => s.queries.length > 50);
  if (longSessions.length > 0) {
    const growthData = longSessions.map(s => {
      const first5 = s.queries.slice(0, 5).reduce((sum, q) => sum + q.totalTokens, 0) / Math.min(5, s.queries.length);
      const last5 = s.queries.slice(-5).reduce((sum, q) => sum + q.totalTokens, 0) / Math.min(5, s.queries.length);
      return { session: s, first5, last5, ratio: last5 / Math.max(first5, 1) };
    }).filter(g => g.ratio > 2);

    if (growthData.length > 0) {
      const avgGrowth = (growthData.reduce((s, g) => s + g.ratio, 0) / growthData.length).toFixed(1);
      const worstSession = growthData.sort((a, b) => b.ratio - a.ratio)[0];
      insights.push({
        id: 'context-growth',
        type: 'warning',
        title: '对话越长，每条消息的费用越高',
        description: `在 ${growthData.length} 个对话中，后面的消息比开始时的消息贵 ${avgGrowth} 倍。为什么？每次你发送消息，Claude 都要从头重新读取整个对话。所以第 5 条消息很便宜，但第 80 条就很贵了，因为 Claude 要重新读取之前 79 条消息和所有代码。你最长的对话（"${worstSession.session.firstPrompt.substring(0, 50)}..."）到最后贵了 ${worstSession.ratio.toFixed(1)} 倍。`,
        action: '切换到新任务时开始新的对话。如果需要之前的上下文，在第一条消息里粘贴一个简短的摘要。这给了 Claude 一个干净的起点，而不是重新读取数百条旧消息。',
      });
    }
  }

  // 3. Marathon conversations
  const turnCounts = sessions.map(s => s.queryCount);
  const medianTurns = turnCounts.sort((a, b) => a - b)[Math.floor(turnCounts.length / 2)] || 0;
  const longCount = sessions.filter(s => s.queryCount > 200).length;
  if (longCount >= 3) {
    const longTokens = sessions.filter(s => s.queryCount > 200).reduce((s, ses) => s + ses.totalTokens, 0);
    const longPct = ((longTokens / Math.max(totals.totalTokens, 1)) * 100).toFixed(0);
    insights.push({
      id: 'marathon-sessions',
      type: 'info',
      title: `${longCount} 个长对话消耗了所有 token 的 ${longPct}%`,
      description: `你有 ${longCount} 个超过 200 条消息的对话。这些对话单独就消耗了 ${fmt(longTokens)} token -- 占了全部的 ${longPct}%。而你一般的对话大约是 ${medianTurns} 条消息。长对话不一定不好，但它们费用高得不成比例，因为上下文会不断累积。`,
      action: '尝试一个任务一个对话。当对话开始偏离到不同主题时，就是开始新对话的好时机。',
    });
  }

  // 4. Most tokens are re-reading, not writing
  if (totals.totalTokens > 0) {
    const outputPct = (totals.totalOutputTokens / totals.totalTokens) * 100;
    if (outputPct < 2) {
      insights.push({
        id: 'input-heavy',
        type: 'info',
        title: `只有 ${outputPct.toFixed(1)}% 的 token 是 Claude 实际写的内容`,
        description: `有个惊人的事实：在 ${fmt(totals.totalTokens)} 总 token 中，只有 ${fmt(totals.totalOutputTokens)} 是 Claude 写回复的。另外 ${(100 - outputPct).toFixed(1)}% 是 Claude 在每次回复前重新读取你的对话历史、文件和上下文。这意味着 token 使用的最大因素不是 Claude 写了多少 -- 而是对话有多长。`,
        action: '缩短对话比要求简短回复更有效果。20 条消息的对话比 200 条消息的对话便宜很多，即使总输出相似。',
      });
    }
  }

  // 5. Day-of-week pattern
  if (sessions.length >= 10) {
    const dayOfWeekMap = {};
    for (const s of sessions) {
      if (!s.timestamp) continue;
      const d = new Date(s.timestamp);
      const day = d.getDay();
      if (!dayOfWeekMap[day]) dayOfWeekMap[day] = { tokens: 0, sessions: 0 };
      dayOfWeekMap[day].tokens += s.totalTokens;
      dayOfWeekMap[day].sessions += 1;
    }
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const days = Object.entries(dayOfWeekMap).map(([d, v]) => ({ day: dayNames[d], ...v, avg: v.tokens / v.sessions }));
    if (days.length >= 3) {
      days.sort((a, b) => b.avg - a.avg);
      const busiest = days[0];
      const quietest = days[days.length - 1];
      insights.push({
        id: 'day-pattern',
        type: 'neutral',
        title: `你在${busiest.day}使用 Claude 最多`,
        description: `你在${busiest.day}的对话平均每次消耗 ${fmt(Math.round(busiest.avg))} token，而${quietest.day}每次 ${fmt(Math.round(quietest.avg))}。这可能意味着你在${busiest.day}处理更大的任务，或者你的对话倾向于更长。`,
        action: null,
      });
    }
  }

  // 6. Model mismatch -- Opus used for simple conversations
  const opusSessions = sessions.filter(s => s.model.includes('opus'));
  if (opusSessions.length > 0) {
    const simpleOpus = opusSessions.filter(s => s.queryCount < 10 && s.totalTokens < 200_000);
    if (simpleOpus.length >= 3) {
      const wastedTokens = simpleOpus.reduce((s, ses) => s + ses.totalTokens, 0);
      const examples = simpleOpus.slice(0, 3).map(s => '"' + s.firstPrompt.substring(0, 40) + '"').join(', ');
      insights.push({
        id: 'model-mismatch',
        type: 'warning',
        title: `${simpleOpus.length} 个简单对话不必要地使用了 Opus`,
        description: `这些对话消息数少于 10 条，却在 Opus 上消耗了 ${fmt(wastedTokens)} token：${examples}。Opus 是能力最强的模型，但也是最贵的。对于简单问题和小型任务，Sonnet 或 Haiku 能给出类似结果，成本却低得多。`,
        action: '使用 /model 切换到 Sonnet 或 Haiku 处理简单任务。把 Opus 留给复杂的多文件修改、架构决策或棘手的调试。',
      });
    }
  }

  // 7. Tool-heavy conversations
  if (sessions.length >= 5) {
    const toolHeavy = sessions.filter(s => {
      const userMessages = s.queries.filter(q => q.userPrompt).length;
      const toolCalls = s.queryCount - userMessages;
      return userMessages > 0 && toolCalls > userMessages * 3;
    });
    if (toolHeavy.length >= 3) {
      const totalToolTokens = toolHeavy.reduce((s, ses) => s + ses.totalTokens, 0);
      const avgRatio = toolHeavy.reduce((s, ses) => {
        const userMsgs = ses.queries.filter(q => q.userPrompt).length;
        return s + (ses.queryCount - userMsgs) / Math.max(userMsgs, 1);
      }, 0) / toolHeavy.length;
      insights.push({
        id: 'tool-heavy',
        type: 'info',
        title: `${toolHeavy.length} 个对话的工具调用是消息的 ${Math.round(avgRatio)} 倍`,
        description: `在这些对话中，Claude 对你每条消息大约调用 ~${Math.round(avgRatio)} 次工具。每次工具调用（读取文件、运行命令、搜索代码）都是一次完整的往返，需要重新读取整个对话。这 ${toolHeavy.length} 个对话总共消耗了 ${fmt(totalToolTokens)} token。`,
        action: '尽可能指向特定的文件和行号。"修复 src/auth.js 第 42 行的 bug" 比"修复登录 bug"触发的工具调用少得多，因为后者需要 Claude 先搜索正确的文件。',
      });
    }
  }

  // 8. One project dominates usage
  if (sessions.length >= 5) {
    const projectTokens = {};
    for (const s of sessions) {
      const proj = s.project || 'unknown';
      projectTokens[proj] = (projectTokens[proj] || 0) + s.totalTokens;
    }
    const sorted = Object.entries(projectTokens).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2) {
      const [topProject, topTokens] = sorted[0];
      const pct = ((topTokens / Math.max(totals.totalTokens, 1)) * 100).toFixed(0);
      if (pct >= 60) {
        const projName = topProject.replace(/^C--Users-[^-]+-?/, '').replace(/^Projects-?/, '').replace(/-/g, '/') || '~';
        insights.push({
          id: 'project-dominance',
          type: 'info',
          title: `${pct}% 的 token 用在了一个项目上：${projName}`,
          description: `你的"${projName}"项目消耗了 ${fmt(topTokens)} token，总共 ${fmt(totals.totalTokens)}。占了你全部使用的 ${pct}%。第二接近的项目只消耗了 ${fmt(sorted[1][1])} token。`,
          action: '不一定是问题，但值得注意。如果这个项目有长对话，拆分成更小的会话可能减少它的占用。',
        });
      }
    }
  }

  // 9. Conversation efficiency -- short vs long conversations cost per message
  if (sessions.length >= 10) {
    const shortSessions = sessions.filter(s => s.queryCount >= 3 && s.queryCount <= 15);
    const longSessions2 = sessions.filter(s => s.queryCount > 80);
    if (shortSessions.length >= 3 && longSessions2.length >= 2) {
      const shortAvg = Math.round(shortSessions.reduce((s, ses) => s + ses.totalTokens / ses.queryCount, 0) / shortSessions.length);
      const longAvg = Math.round(longSessions2.reduce((s, ses) => s + ses.totalTokens / ses.queryCount, 0) / longSessions2.length);
      const ratio = (longAvg / Math.max(shortAvg, 1)).toFixed(1);
      if (ratio >= 2) {
        insights.push({
          id: 'conversation-efficiency',
          type: 'warning',
          title: `长对话中每条消息贵 ${ratio} 倍`,
          description: `在你的短对话（15 条消息以下）中，每条消息约消耗 ${fmt(shortAvg)} token。在长对话（80+ 条消息）中，每条消息约消耗 ${fmt(longAvg)} token。这是因为 Claude 每轮都要重新读取整个历史，费用是后者的 ${ratio} 倍。`,
          action: '这是降低 token 使用最大的杠杆。更频繁地开始新对话。5 个短对话的工作流比一个 500 条消息的马拉松对话便宜得多。',
        });
      }
    }
  }

  // 10. Heavy context on first message (large CLAUDE.md or system prompts)
  if (sessions.length >= 5) {
    const heavyStarts = sessions.filter(s => {
      const firstQuery = s.queries[0];
      return firstQuery && firstQuery.inputTokens > 50_000;
    });
    if (heavyStarts.length >= 5) {
      const avgStartTokens = Math.round(heavyStarts.reduce((s, ses) => s + ses.queries[0].inputTokens, 0) / heavyStarts.length);
      const totalOverhead = heavyStarts.reduce((s, ses) => s + ses.queries[0].inputTokens, 0);
      insights.push({
        id: 'heavy-context',
        type: 'info',
        title: `${heavyStarts.length} 个对话以 ${fmt(avgStartTokens)}+ token 的上下文开始`,
        description: `在你输入第一条消息之前，Claude 就要读取你的 CLAUDE.md、项目文件和系统上下文。在这 ${heavyStarts.length} 个对话中，这个初始上下文平均 ${fmt(avgStartTokens)} token。在所有这些对话中，光设置就消耗了 ${fmt(totalOverhead)} token -- 而且这个上下文在每条消息中都会被重新读取。`,
        action: '让你的 CLAUDE.md 文件保持简洁。删除你很少需要的部分。更小的初始上下文在对话的每条消息中都会复合成节省。',
      });
    }
  }

  // 11. Cache efficiency
  if (totals.totalCacheReadTokens > 0) {
    const saved = totals.totalSaved;
    const hitRate = (totals.cacheHitRate * 100).toFixed(1);
    const withoutCaching = totals.totalCost + saved;
    insights.push({
      id: 'cache-savings',
      type: 'info',
      title: `缓存预计帮你节省了 $${saved.toFixed(2)}`,
      description: `你的缓存命中率是 ${hitRate}% -- 意味着 ${hitRate}% 的输入 token 以 10 倍低的成本从缓存提供。如果没有缓存，你预计的 API 等效账单会是 $${withoutCaching.toFixed(2)} 而不是 $${totals.totalCost.toFixed(2)}。缓存读取发生在 Claude 重新读取上次以来没有变化的部分对话时。`,
      action: '缓存在上下文保持稳定的长对话中效果最好。较短的会话意味着更少的缓存复用，但也会减少上下文增长。最佳点是专注于单一任务的中等长度会话。',
    });
  }

  // 12. Smart /clear suggestion based on inflection points
  const qualifyingSessions = sessions.filter(s => s.queries.length >= 10);
  if (qualifyingSessions.length >= 3) {
    const inflections = [];
    for (const s of qualifyingSessions) {
      const queries = s.queries;
      // Compute baseline: avg cost of first 5 turns
      const baselineSlice = queries.slice(0, 5);
      const baselineCost = baselineSlice.reduce((sum, q) => sum + q.cost, 0) / baselineSlice.length;
      if (baselineCost <= 0) continue;

      // Find inflection: rolling 3-turn avg exceeds 2x baseline
      let inflectionTurn = null;
      for (let i = 2; i < queries.length; i++) {
        const windowCost = (queries[i].cost + queries[i - 1].cost + queries[i - 2].cost) / 3;
        if (windowCost > baselineCost * 2) {
          inflectionTurn = i - 1; // 0-indexed turn where it starts
          break;
        }
      }
      if (inflectionTurn !== null) {
        const laterCost = queries.slice(inflectionTurn).reduce((s, q) => s + q.cost, 0) / (queries.length - inflectionTurn);
        inflections.push({ turn: inflectionTurn, multiplier: laterCost / baselineCost });
      }
    }

    if (inflections.length >= 2) {
      // Median inflection turn
      inflections.sort((a, b) => a.turn - b.turn);
      const medianTurn = inflections[Math.floor(inflections.length / 2)].turn;
      const avgMultiplier = (inflections.reduce((s, inf) => s + inf.multiplier, 0) / inflections.length).toFixed(1);

      insights.push({
        id: 'smart-clear',
        type: 'warning',
        title: `在第 ~${medianTurn} 轮后使用 /clear 可以节省 token`,
        description: `在 ${inflections.length} 个对话中，消息从第 ${medianTurn} 轮开始贵了 ${avgMultiplier} 倍。这是因为 Claude 每轮都要重新读取整个对话历史，费用随着上下文增长而累积。`,
        action: `尝试在第 ${medianTurn} 轮左右使用 /clear。清除之前，粘贴一个你正在做什么的简短摘要，让 Claude 为下一条消息保留上下文。你也可以使用 CONTEXT.md 在对话之间传递笔记。`,
      });
    }
  }

  return insights;
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(0) + 'K';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

module.exports = { parseAllSessions };
