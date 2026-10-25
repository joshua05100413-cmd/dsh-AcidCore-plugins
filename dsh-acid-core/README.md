# dsh-acid-core

酸性科技风（Acid Graphics）三件套，一个 bundle，一个宿主行。**界面里没有任何悬浮窗**：控制项全部在「设置 → Acid Core」。

| 模块 | 交付物 | 位置 |
|---|---|---|
| A 启动背景 | WebGL 线框晶体 + 法线波浪位移 + 鼠标/滚动联动 | `shell.overlay`（click-through 画布） |
| B 控制面板 | 主题格 + 背景开关 + 三条滑块 + 实时 FPS | `settings.section`（设置里新开一节） |
| C 主题 | Acid-Mono 完整主题（117 个 token：alias + 非 alias 表面） | `ctx.theme.register`，从主题格里选 |

外加收敛态：顶栏 `ACID // 运行中` 状态点（`conversation.header.leading`）。

## 按反馈迭代了什么

1. **品牌带整体转酸，只换色不换图**：
   - 鲸标：`_brandMark` / `_railMark` / `_fish` 上挂 **alpha 保留的 filter 链**（`brightness(0) → invert → sepia → saturate → hue-rotate`），把白色单色 SVG 映射成 `#CCFF00`，轮廓与透明区域不动。早先的 `mix-blend-mode: multiply` 会染整个盒子，变成一块酸色方块，已废弃。
   - 字标：`deepseek` 与 `HARNESS` 胶囊其实在**同一条 SVG artboard** 里（`span._brandName > svg`）。整块套 filter 会把胶囊压成剪影，所以拆三条规则：字标字母走 `currentColor` 变酸、胶囊的 `rect` 填酸、胶囊里的字（`svg text`）压回深色。
2. **新会话按钮 = 发送键样式**：实心酸底 + 深色图标/文字 + 柔光。子元素颜色一起压深，避免白字压酸底。
3. **交互控件整体转酸**：宿主把"品牌蓝"钉在 `--dsw-static-deepseek-*` 上，吸收 6 个 token 就够——`brand-primary-new-color`（发送键）、`button-info-fill/hover`、`link`、`label-deep-diving*`、`bg-document-selection`。图标与次要按钮不吃这些 token（用 build hash 类名），因此另加一层**只在主题激活时生效**的 CSS：`body[data-acid-theme="on"]` 下的 `_primary`、`_folder`/`_folderActive`、`_iconButton`/`_action`（排除 `danger`/`delete`）、`_newSession`。切回深色 → 整层规则失效。
4. **"白色气泡、白字看不清"的真凶（两处，同类）**：
   - 用户气泡用 `--dsw-specific-bubble`，**不在 `--dsw-alias-*` 家族里**；同族还有输入卡（`--dsw-specific-input-major`）、菜单（`--dsw-menu-surface-fill`）、思考块渐变（`--dsw-linear-gradient-think`）。这些非 alias token 一起写进主题——presenter 对主题里每个 key 都 `body.style.setProperty()`，所以同样生效、同样随主题撤销。
   - **行内代码芯片**把 `--dsw-alias-markdown-inline-code` 当**背景色**（`._markdown :not(pre)>code{background-color:…}`，字色继承 `label-primary`）。最初把规格里的"代码文字色"填进去，于是变成浅底浅字。现在它是 `#1B2130`，对正文 13:1。
   - 教训：**token 是"前景"还是"背景"必须按实际消费方核对**。`tools/token-usage.mjs` 会列出每个 token 的消费属性。
5. **主题完整化**：从 `overrideTokens`（只覆盖 40 个 token，留下半套配色）改成 **`ctx.theme.register` 注册完整主题**：101 个 `--dsw-alias-*` + 16 个非 alias 表面 token 全部给定值；语义状态色 / diff 色 / 语法色保留宿主设计。
6. **主题选择会被记住**：注册的第三方主题 id 不在宿主 settings schema 里，重启或热更新会掉回内置主题。用 `localStorage` 记住选择并在加载时重新 `setTheme`——**顺序必须在 `register` 之后**，否则会因"未注册"抛错而静默失败。在宿主「外观」里改成别的主题会自动清除记忆。
7. **主题挪进设置**：删掉悬浮 HUD，新增 `settings.section`「Acid Core」，主题做成 3 个主题格（浅色 / 深色 / 酸性暗色），点一下即全局生效。

## 为什么不是 three.js

DSH 浏览器半身的模块表只有 `react`（客户端插件 `factory(require)` 只能拿它；第三方包要走 `dsh.client.external`，本地又没有可用 CDN）。所以手写了等价的 WebGL 渲染器：同一套细分几何、同一套 shader 语义、同一组 uniforms，约 300 行、零依赖、零构建。要换回 three.js 只需替换 `createBackdrop` 内部。

## 视觉与性能合同

- **几何**：二十面体 20 阶 → 8000 面 / 4620 顶点 / 12600 线段，Uint16 索引够用；**建一次**，之后只有 uniform 写入。
- **逐帧零分配**：颜色、矩阵、鼠标/滚动数组都在闭包里复用。
- **60 Hz 上限**：165Hz 屏按 `acc < 1/61` 跳帧；DPR 上限 1.25；连续掉到 45fps 以下只降像素比，不重建几何。
- **正文遮挡在 shader 里**（`uSafeCenter/uSafeScale`，栏内 alpha 5%），不用 CSS mask（省掉每帧一整屏的合成 pass）。
- **自动退景**：每 60 帧探测宿主语义类名，会话有正文时晶体透明度平滑降到 0.24；空白首屏 0.92。
- **不阻塞**：没有 `setTimeout` / `setInterval`（自检强制）；`prefers-reduced-motion` 只画一帧静止画面。

## Acid-Mono 映射

| 用途 | 值 |
|---|---|
| 画布 / 表面 | `bg-base #08090C`、`bg-layer-* #101218`、`markdown-code-block #0B0D12`、气泡 `#151A24`、输入卡 `#101218` |
| 细线 | `border-l1..l4 #1E2330 / #2B3346` |
| 正文 / 次级 / 代码 | `#F1F5F9` / `#8B99AC` / `#CBD5E1`（行内代码芯片底 `#1B2130`） |
| 强调 | `state-business-primary #CCFF00`、`brand-primary-new-color`、`button-info-fill/hover`、`link`、`label-deep-diving*` |

焦点环走宿主现成机制：`focus.css` 读 `--dsw-alias-state-business-primary`，所以输入框聚焦就是 1px 酸性线。

## 目录

```
package.json        清单：dsh.bundle.patch + dsh.client
cordis.patch.yml    一行 insert
index.js            宿主半身（空 apply）
client.js           几何 / shader / 渲染器 / 设置页 / 主题 / 样式
locale/{zh,en}.json 插件管理器展示信息
icon.svg            图标
validate.mjs        离线自检（无需 DSH、无需 WebGL）
```

## 安装 / 回滚

已装进 `~/.dsh/profiles/desktop`（目录 link + manifest 依赖 + bundle 行）：

```powershell
node ..\tools\install-profile.mjs --dry-run   # 看要改什么
node ..\tools\install-profile.mjs             # 应用
node ..\tools\install-profile.mjs --revert    # 还原 manifest 并删 link
```

客户端改动 HMR 即时生效；宿主半身改动需重启。

**主题基座更新**（宿主升级后 token 有增减时）：

```powershell
node ..\tools\parse-theme.mjs "<app>/resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js>"
node ..\tools\build-acid-theme.mjs            # 重写 client.js 的 @acid-theme-base 区块
```

## 自检

```powershell
node --check client.js
node validate.mjs
```

覆盖：清单 / patch / locale / icon、插件契约（`inject: []`）、apply 接线（theme/slots/locale，3 个注册）、**主题完整性**（≥100 个 alias token、非 alias 表面 token 必须存在、无纯白表面）、对比度逐对断言（正文 ≥12:1、次级 ≥4.5:1、气泡/输入卡/行内代码 ≥7:1，且这些底色不得为亮色）、强调色只落在交互 token 上、几何不变量、参数钳制、设置页渲染（3 主题格 + 3 滑块 + 1 开关）、主题格点击 → `setTheme` + 记忆 + 重放、affordance 规则必须带主题作用域、logo 只许换色不许换图。

**不做**：shader 编译、真实线框输出、帧率、以及"整页观感"——那是运行期 + 人眼属性。

## 已知边界

- **光标闪烁频率**：只设 `caret-color`，闪烁由 OS 控制（Windows 默认 ~530ms）。要严格 800–1000ms 得自绘光标并隐藏原生 caret，属于侵入宿主编辑器，暂不做。
- **思考折叠 hazard striping**：靠语义类名后缀匹配（`[class*="_reasoning"]`），匹配不到退化为不装饰，不破版。
- **affordance 规则依赖 build hash 类名的语义后缀**（`_primary` / `_folder` / `_newSession` / `_iconButton` / `_action`）。宿主重命名时只会"退回原色"，不会破版。
- **第三方主题 id 不跨重启持久化**（宿主 schema 限制），由本插件的 localStorage 记忆兜住；换机器/清缓存后需再点一次主题格。
- **屏幕尺寸怪癖**：本机 DSH 窗口比显示器大（右/下溢出），所以没有 `bottom/right` 定位的界面元素。
