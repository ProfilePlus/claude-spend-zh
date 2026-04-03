# 🔥 Claude Spend 中文版

<div align="center">

[![Stars](https://img.shields.io/github/stars/ProfilePlus/claude-spend-zh?style=social)](https://github.com/ProfilePlus/claude-spend-zh/stargazers)
[![Forks](https://img.shields.io/github/forks/ProfilePlus/claude-spend-zh?style=social)](https://github.com/ProfilePlus/claude-spend-zh/network/members)
[![License](https://img.shields.io/github/license/ProfilePlus/claude-spend-zh)](https://github.com/ProfilePlus/claude-spend-zh/blob/main/LICENSE)

**一条命令，看清你的 Claude Code 额度都花在了哪里。**

*[English](./README_en.md) · [原版英文](https://github.com/writetoaniketparihar-collab/claude-spend) · [中文版](#)*

</div>

---

## ✨ 特性

- 🌐 **纯中文界面** — 专为中文用户设计，无需再啃英文
- 📊 **可视化仪表盘** — 直观查看每日用量、模型分布、会话明细
- 🔍 **深度洞察** — 智能分析高消耗提示词、缓存效率、使用模式
- 🔒 **100% 本地运行** — 数据从不离开你的电脑
- ⚡ **一条命令** — 无需安装配置，即开即用

## 📸 截图

<details>
<summary>点击展开截图</summary>

**中文首页**
<img width="1400" height="900" alt="首页截图" src="screenshots-dashboard/landing.png">

**中文仪表盘**（首次使用显示此界面，有数据后会自动分析）
<img width="1400" height="900" alt="仪表盘截图" src="screenshots-dashboard/01-overview.png">

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
| **洞察面板** | 智能提示：哪些对话最费 token、高消耗提示词、如何节省 |
| **每日趋势** | 堆积柱状图，按日期展示用量变化 |
| **模型分布** | 环形图，展示 Opus / Sonnet / Haiku 使用占比 |
| **消耗排行** | 消耗最高的 20 条提示词 |
| **会话列表** | 支持搜索、排序的完整会话记录 |

## 💡 常见问题

**Q: 这个工具安全吗？**
> A: 100% 安全。所有数据读取自本地 `~/.claude/` 目录，完全离线运行，不发送任何数据。

**Q: 和原版有什么区别？**
> A: 本项目是 [原版 claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend) 的中文本地化版本，界面和文档已全部翻译为中文，功能完全一致。

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
| 功能 | 相同 | 相同 |

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

<div align="center">

**如果这个项目对你有帮助，请点一个 ⭐**

</div>
