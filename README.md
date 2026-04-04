# 🔥 Claude Spend 中文版

<div align="center">

[![Stars](https://img.shields.io/github/stars/ProfilePlus/claude-spend-zh?style=social)](https://github.com/ProfilePlus/claude-spend-zh/stargazers)
[![Forks](https://img.shields.io/github/forks/ProfilePlus/claude-spend-zh?style=social)](https://github.com/ProfilePlus/claude-spend-zh/network/members)
[![License](https://img.shields.io/github/license/ProfilePlus/claude-spend-zh)](https://github.com/ProfilePlus/claude-spend-zh/blob/main/LICENSE)

**一条命令，看清你的 Claude Code 额度都花在了哪里。**

*[English](./README_en.md) · [原版英文](https://github.com/writetoaniketparihar-collab/claude-spend) · [中文版](#)*

</div>

---

## 🆕 相比原版新增

> 以下功能为本项目在 [原版 claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend) 基础上独立开发，原版不包含。

| 新增功能 | 说明 |
|---------|------|
| 📅 **日期筛选** | 预设快捷按钮（全部 / 今天 / 近 7 天 / 近 30 天）+ 自定义日期范围 |
| 📊 **实时联动** | 切换日期后，统计卡片、每日趋势图、模型分布图、会话列表等全部实时刷新 |
| 🔢 **Token 单位切换** | 支持 自动 / 万 / 百万 / 亿 四种显示单位，一键切换 |
| 🌐 **中英文切换** | 支持中文/English 双语界面，一键切换语言 |

<img alt="日期筛选功能" src="screenshots-dashboard/date-filter.png">

---

## ✨ 特性

- 🌐 **中英文双语** — 支持中文/English 界面切换，满足不同用户需求
- 📊 **可视化仪表盘** — 直观查看每日用量、模型分布、会话明细
- 📅 **日期筛选** — 支持全部/今天/近7天/近30天及自定义日期范围，图表和统计实时联动
- 🔢 **Token 单位切换** — 支持自动/万/百万/亿，适配不同量级的数据展示
- 🔍 **深度洞察** — 智能分析高消耗提示词、缓存效率、使用模式
- 🔒 **100% 本地运行** — 数据从不离开你的电脑
- ⚡ **一条命令** — 无需安装配置，即开即用

## 📸 截图

<details>
<summary>点击展开截图</summary>

**中文仪表盘**
<img alt="仪表盘截图" src="screenshots-dashboard/01-overview.png">

</details>

## 🚀 快速开始

### 最简单的方式

```bash
npx claude-spend-zh
```

### 或者本地安装

```bash
git clone https://github.com/ProfilePlus/claude-spend-zh.git
cd claude-spend-zh
npm install
npm start
```

然后访问 **http://localhost:3456**

## 📖 你会看到什么？

| 功能 | 说明 |
|------|------|
| **总使用量** | 全部 token 消耗，分类统计输入/缓存/输出 |
| **日期筛选** | 全部/今天/近7天/近30天/自定义范围，图表统计实时联动 |
| **单位切换** | Token 数量支持 自动/万/百万/亿 四种显示单位 |
| **语言切换** | 支持中文/English 双语界面切换 |
| **洞察面板** | 智能提示：哪些对话最费 token、高消耗提示词、如何节省 |
| **每日趋势** | 堆积柱状图，按日期展示用量变化 |
| **模型分布** | 环形图，展示 Opus / Sonnet / Haiku 使用占比 |
| **消耗排行** | 消耗最高的 20 条提示词 |
| **会话列表** | 支持搜索、排序的完整会话记录 |

## 💡 常见问题

**Q: 这个工具安全吗？**
> A: 100% 安全。所有数据读取自本地 `~/.claude/` 目录，完全离线运行，不发送任何数据。

**Q: 和原版有什么区别？**
> A: 界面和文档全部中文化，并且新增了日期筛选功能（原版没有），详见上方 [🆕 相比原版新增](#-相比原版新增)。

**Q: 支持哪些平台？**
> A: 支持 macOS、Windows、Linux。只要装有 Node.js 18+ 即可运行。

## 🔧 命令行选项

```bash
claude-spend-zh --port 8080   # 自定义端口（默认 3456）
claude-spend-zh --no-open     # 不自动打开浏览器
claude-spend-zh --help        # 显示帮助
```

## 🙏 致谢

本项目基于 [Aniket Parihar](https://github.com/writetoaniketparihar-collab) 的优秀作品 **[claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend)** 进行中文本地化。

| | 原版 | 本地化版 |
|---|---|---|
| 作者 | [@writetoaniketparihar-collab](https://github.com/writetoaniketparihar-collab) | [@ProfilePlus](https://github.com/ProfilePlus) |
| 语言 | 英文 | 中文 |
| 功能 | 基础功能 | 基础功能 + 日期筛选 + Token 单位切换 + 中英文切换 |

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

<div align="center">

**如果这个项目对你有帮助，请点一个 ⭐**

</div>
