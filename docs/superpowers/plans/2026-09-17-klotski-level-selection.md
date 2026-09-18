# 华容道多布局选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在小游戏中加入经过资料核验的华容道多布局选择，并为每个布局隔离规则、存档、计时和最佳成绩。

**Architecture:** 以关卡对象作为规则和渲染的唯一输入，默认保留 `classic` 兼容层。游戏场景维护当前关卡与选择弹层；首页读取最近关卡的摘要。存档键按关卡 ID 分隔，旧版横刀立马存档兼容读取。

**Tech Stack:** 原生微信小游戏 Canvas 2D、Node.js 内置测试、现有浏览器视觉验收脚本，无新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-09-17-klotski-level-selection-design.md`

## Global Constraints

- 运行入口保持根目录 `game.js`，项目类型保持 `compileType: "game"`。
- 不创建 WXML、WXSS 或普通小程序页面。
- 仅将资料明确、棋子规格和目标可验证的布局加入可玩列表。
- 保留 `klotski.classic.v1` 旧存档兼容。
- 规则、绘制和触摸命中必须共享同一关卡数据。

---

### Task 1: 核验并建立关卡数据模型

**Files:**
- Modify: `games/klotski/levels.js`
- Create: `games/klotski/level-catalog.js`（若需要将资料目录与运行数据分开）
- Modify: `README.md`
- Test: `tests/rules.test.js`

**Interfaces:**
- Produces `levels`, `defaultLevel`, `getLevel(id)`，每个关卡包含 `id/name/subtitle/pieces/goal/source`。
- `pieces` 使用当前零起点坐标和宽高；`goal` 明确目标棋子、坐标和尺寸。

- [ ] 从维基页面和可引用公开资料整理候选布局，记录名称、图示坐标、棋子结构和目标；无法可靠识别的条目留在资料清单，不进入 `levels`。
- [ ] 为每个候选关卡写占格数量、棋子 ID 唯一性、边界和目标合法性断言。
- [ ] 保持 `classic` 导出别名，确保现有调用方和旧测试继续工作。
- [ ] 在 `tests/rules.test.js` 增加“所有发布关卡结构合法”的失败优先测试，运行 `npm test` 确认测试先失败。
- [ ] 更新 README 的关卡列表、资料来源和暂不收录规则。

### Task 2: 泛化规则与存档

**Files:**
- Modify: `games/klotski/rules.js`
- Modify: `games/klotski/game.js`
- Test: `tests/rules.test.js`
- Test: `tests/game-interaction.test.js`

**Interfaces:**
- `rules.create(level)` 返回绑定关卡的 `initialState/isValid/isWon/canMove/moveRange/move/undo/restore/snapshot`。
- `game.start` 接收 `levelId`，使用 `klotski.<levelId>.v1` 与 `klotski.<levelId>.best.v1`。

- [ ] 先为多关卡规则 API 写失败测试：不同布局的边界、目标、移动和恢复不能互相读取。
- [ ] 将当前规则函数改为使用关卡上下文；保留无参数导出作为 `classic` 兼容包装。
- [ ] 让状态快照写入 `level`，恢复时拒绝其他关卡历史，坏历史回退到该关卡初始状态。
- [ ] 保持计时、悔棋、通关锁定和快速拖动行为不变，并补充跨布局存档隔离测试。

### Task 3: 关卡选择弹层与场景切换

**Files:**
- Modify: `games/klotski/layout.js`
- Modify: `games/klotski/renderer.js`
- Modify: `games/klotski/game.js`
- Modify: `game.js`
- Test: `tests/game-interaction.test.js`

**Interfaces:**
- `layout` 增加 `levelPicker`、`levelRows`、`levelClose` 控件范围。
- 场景通过 `openLevelPicker()` 和 `selectLevel(levelId)` 切换当前关卡。

- [ ] 先增加选择器打开、关闭、点击行和切换后标题同步的失败测试。
- [ ] 在游戏标题旁增加明确的下拉入口，使用 Canvas 弹层列出关卡名称、尺寸/棋子摘要和已完成标记。
- [ ] 选择布局时停止计时、清理拖动和动画、加载目标关卡存档，然后恢复该关卡计时。
- [ ] 选择器在 320×568、375×667、390×844 下不溢出；行高和触摸区域满足小游戏触摸尺寸。
- [ ] 默认入口仍进入最近使用的布局；没有进度时进入横刀立马。

### Task 4: 首页与文档同步

**Files:**
- Modify: `games/index/game.js`
- Modify: `README.md`
- Modify: `tools/check-project.cjs`

- [ ] 首页显示最近选择布局名称，并将继续按钮指向对应关卡。
- [ ] 检查发布包只包含运行时关卡数据，不包含抓取缓存、测试、工具和原始资料。
- [ ] 文档列出已收录布局、来源、存档命名和选择方式。

### Task 5: 全量验证与视觉验收

**Files:**
- Modify: `tools/visual-qa.cjs`
- Test: `tests/rules.test.js`
- Test: `tests/game-interaction.test.js`

- [ ] 增加每个发布关卡至少一条完整解法的规则验证；无法证明可解的布局不得发布。
- [ ] 运行 `npm test`、`npm run check` 和 `git diff --check`。
- [ ] 运行 `npm run visual:qa`，检查选择器、切换、棋盘、存档恢复和三种尺寸截图。
- [ ] 对最终发布列表逐项检查名称、布局图和目标坐标，README 与运行时列表一致。
