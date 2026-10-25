# dsh-acid-core

酸性科技风（Acid Graphics），一个 bundle，一个宿主行。主题、晶体、本地壁纸与背景大字的控制项全部在「设置 → Acid Core」。

| 模块 | 交付物 | 位置 |
|---|---|---|
| A 晶体背景 | WebGL 线框晶体 + 法线波浪位移 + 鼠标/滚动联动；强调色跟随当前配色 | `shell.overlay`（click-through 画布） |
| B 控制面板 | 主题格 + 背景模式 + 图片库 + 遮罩/大字滑块 + 状态带开关 + 实时 FPS | `settings.section`（设置里新开一节） |
| C 主题 | 六套完整配色（酸性 / 霓虹橙 / 电弧青 / 紫罗兰 / 玫红 / 暖橙白），每套 117 个 token，暗色共用表面、只换强调色；暖橙白基于宿主的浅色 token 再铺暖表面 | `ctx.theme.register` ×6，从主题格里选 |
| D 状态带 | 22px 常驻细条：FPS / DPR / WebGL 渲染器 / 当前配色；在设置里可一键关掉并完全释放高度 | `shell.bottom` |
| E 壁纸与大字 | 本地图片缩略图选择、深浅主题遮罩、按窗口缩放的文字 | 独立的底层 DOM，不进入宿主的 overlay 堆叠上下文 |
| F 开机动画 | 内置晶体聚合与品牌文字显现；可选本地视频；播放一次后淡出、支持跳过和重播 | 独立的临时前景层，结束后完整清理 |

外加收敛态：顶栏 `ACID // 运行中` 状态点（`conversation.header.leading`）。

## 0.4.0：循环视频背景

更新后重启 DSH，打开「设置 → Acid Core → 背景 → 视频」。点击「打开视频目录」，放入 MP4 / M4V / WebM，刷新列表并选择「背景视频」。默认目录是 `~/.dsh/acid-core/videos/`，设置了 `DSH_HOME` 时以它为根。单个最多 2 GiB，推荐短循环的 H.264 MP4 或 VP9 WebM；插件不附带视频素材。

- 背景视频静音循环，与开场视频分别记忆，可同时使用；图片与视频模式共用画面适配、深浅色遮罩和背景大字。
- 「暂停背景 / 继续播放」保留当前画面；切到后台自动暂停，返回前台后按用户的暂停设置恢复。
- 系统开启减少动态效果时保持静止帧；播放期间修改系统设置也会即时生效。
- 解码失败、自动播放被拒绝或文件不存在时恢复主题底色，并显示错误；刷新列表或重新选择文件可重试。主题和遮罩调整不会重载视频。切换背景、关闭总开关或卸载会释放视频资源。
- Windows 外壳透明规则与图片模式共用，卡片、输入框和侧栏仍保留主题表面。

`npm test` 包含视频背景的暂停/恢复、后台切换、减少动态效果、迟到事件、播放拒绝和清理回归。可选浏览器验证：`node test-video-background-browser.mjs <Playwright模块路径> <Chrome路径> <短WebM素材路径>`；它在隔离目录中通过真实 HTTP 接口验证解码、循环、实时减少动态效果和错误回退，不修改用户的素材库。

## 0.3.0：无需素材的开机动画

**重启 DSH 即可看到**：内置 SVG 线框晶体从小到大聚合并旋转，`DeepSeek Harness` 字样显现，约 3 秒后淡出，交回现有聊天界面。动画跟随当前主题；无需视频、图片或额外依赖。

- 设置入口在「Acid Core」顶部的「开机动画」，默认启用「内置晶体动画」。可关闭启动播放，也可随时「重播开场」。
- 每轮窗口会话自动播放一次，普通刷新和插件重载不会反复播放。Esc / 左上角「跳过开场」可提前结束；动画层不截获整屏点击。
- 系统开启减少动态效果时不自动播放；手动重播只显示短暂静止画面。
- 切到后台、关闭功能或卸载时立即撤掉临时层。播放、淡出都由可取消的 rAF 驱动，不阻塞宿主启动。
- 如果安装了 `dsh-startup-screen`，会等 `#dsh-startup-root` 进入 `dsu-handoff` / `dsu-gone` 再开始；等待超过 10 秒则跳过。这是该插件的内部约定，改名时会安全跳过。

也保留「本地视频」模式：点击「打开视频目录」，把 MP4 / M4V / WebM 放进 `~/.dsh/acid-core/videos/`（以 `DSH_HOME` 为根），刷新列表后选择文件；空选项自动使用最新文件。单个文件最多 2 GiB，推荐 H.264 MP4 或 VP9 WebM。静音播放，成功开播后才挂载前景层，播放结束淡出；失败、拒绝自动播放或 12 秒无进展都会清理，不留下黑屏。视频模式与常驻背景开关相互独立。

视频接口是 `GET /acid-core/videos`、`GET|HEAD /acid-core/video?name=…` 和 `POST /acid-core/open-videos`。媒体流支持单段 Range，包括后缀字节范围；越界或无效范围返回 416。此次添加了宿主接口，更新后需要重启 DSH。

`test-intro.mjs` 验证原生动画、会话只播一次、重播、跳过、减少动态效果、已有开场衔接、切后台、视频错误/卡住、卸载后的迟到事件，以及真实 HTTP 流和字节范围。

## 0.2.0：本地壁纸与背景大字

这次新增了宿主路由，**更新后先重启 DSH**，再打开「设置 → Acid Core」。

1. 在「背景」里选择「晶体 / 图片 / 无」。默认仍是晶体；旧参数与状态带开关自动保留。
2. 选择「图片」，点击「打开图片目录」，把素材放进 `~/.dsh/acid-core/wallpapers/`，然后点击「刷新列表」和图片缩略图。配置了 `DSH_HOME` 时以它为根目录。
3. 支持 JPG、JPEG、PNG、WebP、AVIF、GIF、BMP，单张最多 32 MiB。可选铺满或完整显示；不会自动选中最新文件，也不包含任何媒体素材。
4. 深色与浅色遮罩分别记忆，默认 84% / 90%，随主题服务切换。设置卡片、输入框与代码块保留原有表面；复杂壁纸需要自行提高遮罩浓度。
5. 「背景大字」最多 80 个字符，可与任一背景模式搭配；默认关闭，颜色随主题强调色变化。总开关「显示背景」同时隐藏晶体、图片与大字。
6. 「背景诊断」显示版本、目录、已选图片和加载状态。图片失败时撤销外壳透明；刷新或重新点同一张图会重试。选择、遮罩与大字保存在本机 `dsh.acid-core.params`。

透明底色通过插件属性限定的 CSS 覆盖；关闭或卸载后移除该属性，直接恢复主题服务当前的 token，不回写旧主题值。主题切换只更新遮罩和文字颜色，不重新挂载图片。晶体后台暂停后返回前台会恢复，减少动态效果模式始终保持静止。

宿主接口：`GET /acid-core/wallpapers`（列表）、`GET /acid-core/wallpaper?name=…`（图片）、`POST /acid-core/open-wallpapers`（打开目录）。文件限制在素材目录，拒绝路径穿越及指向目录外的链接；图片设置不通过宿主接口写入。

设计借鉴 [LeeRolling/dsh-chat-wallpaper](https://github.com/LeeRolling/dsh-chat-wallpaper)（MIT）的独立底图、遮罩、大字与生命周期回归思路；透明外壳手法的上游来源为 [KylinQ01/dsh-startup-animation](https://github.com/KylinQ01/dsh-startup-animation)。本次为独立实现，沿用 Acid Core 的 React、主题服务与设置插槽；未引入视频或启动动画的内部 class 约定。

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
7. **主题挪进设置**：删掉悬浮 HUD，新增 `settings.section`「Acid Core」，主题做成主题格，点一下即全局生效。
8. **多配色**：在 Acid-Mono 之外加了 5 套配色。暗色四套（霓虹橙 / 电弧青 / 紫罗兰 / 玫红）复用同一套 matte 表面，只替换强调色家族（发送键、链接、图标、选中态、聚焦环）；暖橙白是浅色方案，**从宿主自己的 light alias token 起底**再铺暖表面，所以宿主换浅色调色板时它会跟着走。记忆从布尔值改成 **theme id**（旧值 `on` 自动迁移到 `acid-mono`），设置页主题格数量随注册数自动增长。

## 为什么不是 three.js

DSH 浏览器半身的模块表只有 `react`（客户端插件 `factory(require)` 只能拿它；第三方包要走 `dsh.client.external`，本地又没有可用 CDN）。所以手写了等价的 WebGL 渲染器：同一套细分几何、同一套 shader 语义、同一组 uniforms，约 300 行、零依赖、零构建。要换回 three.js 只需替换 `createBackdrop` 内部。

## 视觉与性能合同

- **几何**：二十面体 20 阶 → 8000 面 / 4620 顶点 / 12600 线段，Uint16 索引够用；**建一次**，之后只有 uniform 写入。
- **逐帧零分配**：颜色、矩阵、鼠标/滚动数组都在闭包里复用。
- **60 Hz 上限**：165Hz 屏按 `acc < 1/61` 跳帧；DPR 上限 1.25；连续掉到 45fps 以下只降像素比，不重建几何。
- **正文遮挡在 shader 里**（`uSafeCenter/uSafeScale`，栏内 alpha 5%），不用 CSS mask（省掉每帧一整屏的合成 pass）。
- **自动退景**：每 60 帧探测宿主语义类名，会话有正文时晶体透明度平滑降到 0.24；空白首屏 0.92。
- **不阻塞**：没有 `setTimeout` / `setInterval`（自检强制）；`prefers-reduced-motion` 只画一帧静止画面。

## 配色表

| 主题 | scheme | 强调色 | 表面 |
|---|---|---|---|
| 酸性暗色 `acid-mono` | dark | `#CCFF00` | matte 黑蓝（`bg-base #08090C`） |
| 霓虹橙 `acid-orange` | dark | `#FF8A00` | 同上，只换强调家族 |
| 电弧青 `acid-cyan` | dark | `#00E5FF` | 同上 |
| 紫罗兰 `acid-violet` | dark | `#B47CFF` | 同上 |
| 玫红 `acid-rose` | dark | `#FF5C8A` | 同上 |
| 暖橙白 `acid-orange-light` | light | `#C2410C` | 暖白（`bg-base #FFFCF7`、气泡 `#FFF1E2`、输入卡 `#FFFFFF`） |

暗色的正文 / 细线 / 代码 chip 值见下表；暖橙白把同一组角色换成 `#2B2119 / #6B584A / #EFE3D5`，强调色用更深的橙以保证白底上的可读性：

| 用途 | Acid-Mono 值 |
|---|---|
| 画布 / 表面 | `bg-base #08090C`、`bg-layer-* #101218`、`markdown-code-block #0B0D12`、气泡 `#151A24`、输入卡 `#101218` |
| 细线 | `border-l1..l4 #1E2330 / #2B3346` |
| 正文 / 次级 / 代码 | `#F1F5F9` / `#8B99AC` / `#CBD5E1`（行内代码芯片底 `#1B2130`） |
| 强调 | `state-business-primary`、`brand-primary-new-color`、`button-info-fill/hover`、`link`、`label-deep-diving*`、`bg-document-selection` |

焦点环走宿主现成机制：`focus.css` 读 `--dsw-alias-state-business-primary`，所以输入框聚焦就是当前配色的 1px 线。鲸标/字标靠 `--acid-brand-hue` 每套配色给一个色相旋转值，颜色跟随但不重画 SVG。

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

宿主半身、清单与客户端代码更新后建议重启 DSH，确保客户端登记版本一致；本次新增的图片接口必须重启后才会出现。设置页操作即时生效；往目录里加图后刷新列表即可。

**主题基座更新**（宿主升级后 token 有增减时）：

```powershell
node ..\tools\parse-theme.mjs "<app>/resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js>"
node ..\tools\build-acid-theme.mjs            # 重写 client.js 的 @acid-theme-base 区块
```

## 自检

```powershell
node --check client.js
npm test
```

`validate.mjs` 覆盖清单、四个插槽、三条宿主路由、六套主题完整性与对比度、几何不变量、参数、主题记忆、设置与状态带。`test-background.mjs` 覆盖前后台恢复（将原 bug 注回内存后同一测试必须失败）、减少动态效果、图片失败/重试、主题切换不重载图片、卸载后不复活、透明样式撤销、旧配置迁移、控件实际接线、异步请求竞态，以及真实 HTTP 图片流、空目录和路径限制。测试使用临时目录，不会修改用户素材或打开资源管理器。

**不做**：shader 编译、真实线框输出、帧率、以及"整页观感"——那是运行期 + 人眼属性。

`test-theme-lifecycle.mjs` 使用内置主题实际的空 token 表结构，覆盖「浅色 → 自定义配色」、主题服务替换、旧监听器清理、延迟事件及清理不覆盖新配色。主题登记和监听器绑定在注入的主题上下文上，随该服务一起卸载。

晶体切换配色只更新颜色 uniform，不销毁并重建同一张 canvas 的 WebGL 上下文。卸载会释放 buffer/program，但不主动调用 `loseContext()`；GPU 意外丢失上下文时隐藏故障画布并停止绘制，避免整页被白色画布覆盖，可关闭再开启「显示背景」恢复。`test-background.mjs` 覆盖画布复用、颜色更新不重建 buffer、上下文丢失的隐藏与清理，并确认注回旧 `loseContext()` 行后同一测试会失败。

## 已知边界

- **光标闪烁频率**：只设 `caret-color`，闪烁由 OS 控制（Windows 默认 ~530ms）。要严格 800–1000ms 得自绘光标并隐藏原生 caret，属于侵入宿主编辑器，暂不做。
- **思考折叠 hazard striping**：靠语义类名后缀匹配（`[class*="_reasoning"]`），匹配不到退化为不装饰，不破版。
- **affordance 规则依赖 build hash 类名的语义后缀**（`_primary` / `_folder` / `_newSession` / `_iconButton` / `_action`）。宿主重命名时只会"退回原色"，不会破版。
- **第三方主题 id 不跨重启持久化**（宿主 schema 限制），由本插件的 localStorage 记忆兜住（记住的是配色 id）；换机器/清缓存后需再点一次主题格。
- **暖橙白依赖宿主浅色 token**：启动时从主题快照里取 `light` 的 alias 列表，取不到（<100 个）就只注册其它五套，暖橙白格不出现，不会留半套配色。
- **品牌标记的颜色是近似值**：鲸标/字标走 filter 链 + 每套配色的 `--acid-brand-hue`，色相可能差几度；要精确得换成着色 mask（会改动宿主 SVG 结构，暂不做）。
- **屏幕尺寸怪癖**：本机 DSH 窗口比显示器大（右/下溢出），所以没有 `bottom/right` 定位的界面元素。
