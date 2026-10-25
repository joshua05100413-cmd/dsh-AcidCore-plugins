# dsh-composer-meter

DeepSeek Harness（DSH）Web GUI 插件：在输入框下方显示一个**与宿主统计同款的 pill**——草稿字数、预估 token、本会话的估算费用。点一下 pill 打开面板：明细、计价、**草稿保险箱**与**草稿清洗**。

- 插槽：`conversation.composer.dock`（宿主本来就给这块留了空间，旁边是宿主自己的 `activity` / `usage` 统计与上下文占用环）
- 数据源：`useInput`（草稿，与宿主 composer 同源）+ `useProjection('tokenUsage')`（宿主的 token 用量投影），**不读 DOM**
- 外观：完全按宿主 pill 的尺寸与 token 写（`--dsw-radius-sm`、`--dsw-alias-label-tertiary`、15px 图标、tabular-nums），不引入自己的配色
- 没有草稿也没有费用时渲染 `null`；有费用但草稿为空时只显示金额，不占额外宽度
- 面板底部锚定在 pill 上方，Esc / 点外面关闭；宽度固定 300px，窄屏会夹到可视区内
- 费用**开箱就有**：内置 DeepSeek 官方价目（Flash / Pro，高峰与空闲自动换价），不用先填任何东西；价目不对时可在面板里切 Pro 或自定义
- 写草稿的操作（恢复、清洗、还原）只走 `inputActions.setDraft`，宿主不给这个接口时按钮置灰，绝不碰编辑器 DOM
- 文案走 locale 服务；没有 locale 服务时按 `document.documentElement.lang` 回退，不会把 key 直接画出来

## 面板里有什么

| 区块 | 内容 |
|---|---|
| 草稿 | 字数、行数、CJK 字符、拉丁字符、空白、预估 tokens；可清洗时出现「清洗草稿」 |
| 本会话 | 未缓存输入 / 缓存读 / 缓存写 / 输出（来自 `tokenUsage`），以及估算费用 |
| 计价 | Flash / Pro / 自定义三档；显示当前是高峰还是空闲、当前生效的单价；自定义时给四个输入框（¥ / 百万 token），写入 `localStorage` 的 `dsh.composer-meter.pricing` |
| 保险箱 | 最近 6 份草稿快照（时间 + 首行 + 字数），点一行恢复；「清空快照」 |

估算口径：CJK 字符按 1 token、其余非空白字符按 3.5 字符/token。**都是估算**，面板里也这么写。

## 草稿保险箱与清洗

- **快照时机**（没有 `setTimeout` / `setInterval`）：首次出现文字立即存；之后最快每 2 秒一份；草稿变空时（发送或清空）把上一版存下来；切会话/卸载时再存一次最后的段落。每会话最多 20 份、总量 200k 字符，超出按时间淘汰。
- **只存纯文本**，按会话存在 `localStorage` 的 `dsh.composer-meter.vault.<sessionId>`；不存附件、引用或选区。恢复是一次 `setDraft`，会覆盖当前草稿——所以它更适合“误删/误发之后找回”，不是版本管理。
- **清洗规则**（保守到只处理确定的问题）：零宽字符/BOM、NBSP 与全角空格、行尾空白、3 个以上连续空行；**代码围栏内部逐字节保留**；不改全角标点、不改智能引号（中文里那是对的）。清洗前会先存一份快照，按钮变「还原」可写回上一版。
- 清洗**不做自动触发**，必须点按钮：改用户正在写的东西，必须显式。

## 费用怎么算

内置价目取自 DeepSeek 官方 API 文档（2026-10 核对），单位：**元 / 百万 token**：

| | Flash 空闲 | Flash 高峰 | Pro 空闲 | Pro 高峰 |
|---|---|---|---|---|
| 输入（缓存未命中） | 1 | 2 | 4.5 | 9 |
| 输入（缓存命中） | 0.02 | 0.04 | 0.15 | 0.3 |
| 输出 | 4 | 8 | 13.5 | 27 |
| 缓存写入 | 0 | 0 | 0 | 0 |

- 北京时间**周一至周五 09:00–12:00、14:00–18:00 为高峰**，其余时段（含周末）按半价；法定节假日未建模，跨节假日的估算会偏高。
- DeepSeek 不单独收缓存写入费，所以那一档是 0；换别的服务商可在「自定义」里改。
- 一个会话跨了时段或换过模型时，整段按**当前时段 + 所选档位**估算；面板里已经写明，金额只用于量级判断。

## 目录

```
package.json        清单：dsh.bundle.patch（宿主半身）+ dsh.client（浏览器半身）
cordis.patch.yml    组合包 patch：一行 insert 挂上宿主行
index.js            宿主半身：export function apply() {}（本插件没有宿主逻辑）
client.js           浏览器半身：ModuleLoader 懒工厂 + slot 注册 + 组件 + 面板
locale/{zh,en}.json 插件管理器里显示的标题/描述
icon.svg            插件管理器图标
validate.mjs        离线自检（不需要 DSH 运行时）
```

## 安装（本机实测路径）

在 DSH 里：**设置 → 插件 → 添加插件**，包名/路径那一栏填本目录的绝对路径：

```
D:\Harness plugin\dsh-composer-meter
```

本地目录会被 link 而不是拷贝，所以改完代码刷新页面就能看到变化（宿主半身改动需要重启）。

## 开发循环

| 改什么 | 怎么生效 |
|---|---|
| `client.js`（组件、样式、插槽） | 保存后刷新页面（Ctrl+R）。`client-hmr` 只在 `pnpm run dev:web` 重建 bundle 时省掉刷新 |
| `index.js` / `cordis.patch.yml` / `package.json` | 需要重启 DSH（宿主组合变了） |
| `locale/*.json`、`icon.svg` | 插件管理器里的展示信息，重新打开插件页即可 |

自检：

```powershell
node --check client.js
node validate.mjs
```

`validate.mjs` 用一个 stub 的 `window.__ModuleLoader__` + stub React 跑一遍：清单字段、patch 行名、locale 元信息、工厂返回值、`apply()` 里的 effect 与 slot 注册、组件在若干草稿下的渲染文本、pill 的 `data-composer-stat` / `aria-expanded` / 空草稿只剩金额，以及 `__test` 里的纯函数（token 估算、费用换算与峰谷、金额格式化、草稿分类、清洗规则、快照裁剪与去重）。它不替代真机验证，但能在装进 profile 之前挡住绝大多数「装完变空槽」的低级错误。

## 想改什么，从哪儿下手

- **换位置**：`client.js` 里 `slots.inject('conversation.composer.dock', …)` 和 `register({ name: 'conversation.composer.dock', … })` 两处一起改。可选的同类插槽：`conversation.input.right`（输入条右侧按钮位）、`conversation.input.left`、`conversation.input.overlay`（覆盖层）。
- **换 token 估算**：只改 `estimateTokens()`。现在是「CJK 字符各 1 token，其余按 3.5 字符/token」；要更准就得接真实分词器，客户端没有现成的。
- **改费用口径**：`PRICE_FIELDS` 决定「哪个价 × 哪个 usage bucket」，`computeCost()` 是唯一的计算点；换币种只需改格式化的符号。
- **加设置项**：注册 `settings.section` 插槽，用一个 `Config`（宿主半身）或 `settingsScope`（浏览器半身）+ `ctx.effect(() => scope.subscribe(...))` 做成可调。

## 两个坑（踩过）

1. **`exports.inject` 必须是 `[]`**。浏览器半身若在 `inject` 里点名一个当前 profile 没有的服务，这个 client entry 会一直 `pending`，而 Web 启动把 pending 当失败（`web boot: 1 entry did not activate`），整个 GUI 起不来。要可选服务就用 `ctx.inject(['locale'], …)`。
2. **组件 prop 形状不可假定**。`useInput`、`useProjection`、`t` 都可能缺；缺了要在渲染前挡掉，否则抛在 render 期间会被 React 的 error boundary 连整个槽一起卸掉，看起来像"插件没生效"。

## 已知边界

- **费用只是估算**：内置价目是官方列表价，实际账单可能因优惠、赠送额度、节假日或服务商差异而不同；面板里明确标注，且可切自定义。
- **峰谷按当前时刻**：整段会话不按每次请求的时刻分别计价；跨时段的长会话会有一段估偏。
- **token 不是分词器结果**：中英混排下的偏差可能到 ±30%，只用于量级判断。
- **保险箱不是版本管理**：只存纯文本、每会话 20 份/200k 字符，恢复会覆盖当前草稿；快照也可能落在你“刚想删掉”的内容上，因此提供“清空快照”。
- **面板不拦截发送**：它只显示与改写草稿，不做任何阻止。
