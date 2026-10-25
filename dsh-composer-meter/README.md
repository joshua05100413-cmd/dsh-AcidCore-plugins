# dsh-composer-meter

DeepSeek Harness（DSH）Web GUI 插件：在输入框下方实时显示**草稿字数**与**预估 token 数**。

- 插槽：`conversation.composer.dock`（宿主本来就给这块留了空间，旁边是宿主自己的上下文计量）
- 数据源：宿主会话标准件 `useInput`（同一个 composer 子树里的 `conversation.input.right` 也用这个读草稿），**不读 DOM**
- 草稿为空时渲染 `null`，不占位、不加边框，`pointer-events: none`，不挡点击
- 颜色全部走主题 token（`--dsw-alias-label-tertiary` / `--dsw-alias-label-dimmed`），跟随明暗主题
- 文案走 locale 服务；没有 locale 服务时按 `document.documentElement.lang` 回退，不会把 key 直接画出来

## 目录

```
package.json        清单：dsh.bundle.patch（宿主半身）+ dsh.client（浏览器半身）
cordis.patch.yml    组合包 patch：一行 insert 挂上宿主行
index.js            宿主半身：export function apply() {}（本插件没有宿主逻辑）
client.js           浏览器半身：ModuleLoader 懒工厂 + slot 注册 + 组件
locale/{zh,en}.json 插件管理器里显示的标题/描述
icon.svg            插件管理器图标
validate.mjs        离线自检（不需要 DSH 运行时）
```

## 安装（本机实测路径）

在 DSH 里：**设置 → 插件 → 添加插件**，包名/路径那一栏填本目录的绝对路径：

```
D:\Harness plugin\dsh-composer-meter
```

对话框接受「包名 / Git 地址 / 压缩包 / 本地绝对路径」，本地目录会被 link 而不是拷贝，所以改完代码刷新页面就能看到变化（宿主半身改动需要重启）。

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

`validate.mjs` 用一个 stub 的 `window.__ModuleLoader__` + stub React 跑一遍：清单字段、patch 行名、locale 元信息、工厂返回值、`apply()` 里的 effect 与 slot 注册、以及组件在若干草稿下的渲染字符串。它不替代真机验证，但能在装进 profile 之前挡住绝大多数「装完变空槽」的低级错误。

## 想改什么，从哪儿下手

- **换位置**：`client.js` 里 `slots.inject('conversation.composer.dock', …)` 和 `register({ name: 'conversation.composer.dock', … })` 两处一起改。可选的同类插槽：`conversation.input.right`（输入条右侧按钮位）、`conversation.input.left`、`conversation.input.overlay`（覆盖层）。
- **换成"对话统计"**：把 `useInput` 换成会话投影（`conversation.*` 的 slot props 会带 `useSession` / `useProjection` 一类的 seat），显示消息数、轮次等。
- **加设置项**：注册 `settings.section` 插槽，用一个 `Config`（宿主半身）或 `settingsScope`（浏览器半身）+ `ctx.effect(() => scope.subscribe(...))` 做成可调。
- **换 token 估算**：只改 `estimateTokens()`。现在是「CJK 字符各 1 token，其余按 3.5 字符/token」，对中英混排够用；要更准就得接真实分词器，客户端没有现成的。

## 两个坑（踩过）

1. **`exports.inject` 必须是 `[]`**。浏览器半身若在 `inject` 里点名一个当前 profile 没有的服务，这个 client entry 会一直 `pending`，而 Web 启动把 pending 当失败（`web boot: 1 entry did not activate`），整个 GUI 起不来。要可选服务就用 `ctx.inject(['locale'], …)`。
2. **组件 prop 形状不可假定**。`useInput`、`t` 都可能缺；缺了要在渲染前挡掉，否则抛在 render 期间会被 React 的 error boundary 连整个槽一起卸掉，看起来像"插件没生效"。
