/**
 * dsh-acid-core — Acid Graphics layer for the DeepSeek Harness Web shell.
 *
 * Theme, crystal and local media, one bundle, one owner:
 *
 *   A. Backdrop  — a WebGL wireframe crystal behind the shell. One geometry
 *      built once; every visual change is a uniform write, so moving a slider
 *      never rebuilds a buffer and never allocates in the frame loop. The host
 *      UI is interactive before the canvas has drawn a single line.
 *   B. Settings  — an "Acid Core" section in Settings: the theme tiles plus the
 *      crystal switches and sliders. No floating window anywhere; the only
 *      thing left on the canvas is the backdrop itself.
 *   C. Theme     — a registered third-party theme (`ctx.theme.register`) with a
 *      complete token set derived from the built-in dark palette, so nothing
 *      keeps a stock colour. It is picked from the tiles and can be left again
 *      in one click, which is what makes it safe.
 *
 * Design contract (zero negative feedback):
 *   - accent is a signal, never a surface: focus rings, active tab, control
 *     state and the crystal lines only;
 *   - the crystal is masked away from the reading column in the shader and
 *     retreats while a transcript is on screen;
 *   - the palette is a *complete* theme, not a partial overlay: every alias
 *     token comes from it, so no control keeps a leftover light-theme colour;
 *   - nothing blocks first paint: one rAF loop, no timers, and a still frame
 *     under `prefers-reduced-motion`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-acid-core',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useSyncExternalStore } = React

    /** Locale namespace of the browser half. */
    const NS = 'acidCore'
    /** Bundle identity, also the theme id this plugin registers. */
    const PKG = 'dsh-acid-core'
    const THEME_ID = 'acid-mono'
    /** Where the crystal parameters are remembered. */
    const STORAGE_KEY = 'dsh.acid-core.params'
    /** Remembers that the user chose the acid theme (it is not a host preference). */
    const THEME_FLAG = 'dsh.acid-core.theme'
    const VERSION = '0.3.1'

    const DICTS = {
      zh: {
        'meta.title': 'Acid Core',
        'meta.description': '晶体开机动画、六套完整配色、本地壁纸与背景大字。选择背景，调整遮罩，让界面保持清晰。',
        nav: 'Acid Core',
        'sec.theme': '主题',
        'sec.themeHint': '选中一个主题即全局生效；每套配色都是完整主题，不只覆盖强调色。随时可以选回「深色」或「浅色」。',
        'theme.light': '浅色',
        'theme.dark': '深色',
        'theme.acid': '酸性暗色',
        'theme.orange': '霓虹橙',
        'theme.cyan': '电弧青',
        'theme.violet': '紫罗兰',
        'theme.rose': '玫红',
        'theme.orangeLight': '暖橙白',
        'theme.system': '跟随系统',
        'theme.current': '当前',
        'sec.crystal': '晶体背景',
        'sec.crystalHint': '只影响背景层：鼠标、滚动与滑块都只写 uniform，不重建几何，60 帧预算。',
        'ctl.distortion': '畸变率',
        'ctl.frequency': '形变频率',
        'ctl.speed': '噪波流速',
        'ctl.backdrop': '启用背景',
        'ctl.statusbar': '状态带',
        'ctl.reset': '复位',
        'status.fps': 'FPS',
        'status.dpr': 'DPR',
        'status.gl': 'WebGL',
        'status.theme': '主题',
        'status.hint': '运行期读数：帧率、像素比、渲染器与当前配色；在上方「晶体背景」卡片里可关闭。',
        'state.fps': 'FPS',
        'chip.active': 'ACID // 运行中',
        'chip.idle': 'ACID // 静默',
        'hint.accent': '强调色落在可交互控件上：发送键、图标、激活态、聚焦环；正文与代码区保持低刺激。',
        'hint.budget': '排版与长文本区域不使用荧光色，酸性只做"信号"。',
        'sec.background': '背景',
        'background.crystal': '晶体',
        'background.image': '图片',
        'background.none': '无',
        'background.enable': '显示背景',
        'background.imageHint': '将图片放入下方目录，再刷新列表。支持 JPG、PNG、WebP、AVIF、GIF、BMP，单张不超过 32 MB。',
        'background.empty': '还没有图片。打开图片目录，放入图片后刷新列表。',
        'background.unselected': '请选择一张图片；也可以切回晶体背景。',
        'background.open': '打开图片目录',
        'background.refresh': '刷新列表',
        'background.loading': '正在读取图片列表…',
        'background.error': '无法读取图片目录。请重启 DSH 后刷新列表。',
        'background.openError': '未能打开目录，请按下方路径手动打开。',
        'background.imageError': '图片读取失败。请刷新列表、重新选择图片，或切回晶体。',
        'background.selected': '已选：{name}',
        'background.fit': '图片适配',
        'background.cover': '铺满',
        'background.contain': '完整显示',
        'background.veilDark': '深色遮罩',
        'background.veilLight': '浅色遮罩',
        'background.veilHint': '遮罩随主题切换；浓度越高，正文越清晰。卡片、输入框与代码块保留原有底色。',
        'sec.banner': '背景大字',
        'banner.enable': '显示大字',
        'banner.text': '文字',
        'banner.placeholder': '输入一句话',
        'banner.opacity': '大字浓度',
        'banner.hint': '最多 80 个字符，随主题变色、随窗口缩放；可与晶体、图片或纯色背景搭配。',
        'diagnostics.title': '背景诊断',
        'diagnostics.version': '插件版本',
        'diagnostics.directory': '图片目录',
        'diagnostics.source': '当前图片',
        'diagnostics.none': '未选择',
        'diagnostics.state': '图片状态',
        'image.idle': '未启用',
        'image.loading': '加载中',
        'image.ready': '已显示',
        'image.error': '加载失败',
        'sec.intro': '开机动画',
        'intro.enable': '启动时播放',
        'intro.mode': '开场方式',
        'intro.animation': '内置晶体动画',
        'intro.video': '本地视频',
        'intro.animationName': '晶体开机动画',
        'intro.animationHint': '无需素材：线框晶体聚合、文字显现，约 3 秒后淡出进入工作区。每轮窗口会话播放一次，Esc 可跳过。',
        'intro.select': '视频',
        'intro.auto': '自动使用最新视频',
        'intro.open': '打开视频目录',
        'intro.refresh': '刷新视频列表',
        'intro.replay': '重播开场',
        'intro.skip': '跳过开场',
        'intro.hint': '每轮窗口会话自动播放一次，静音全屏，播完淡出。支持 MP4 / M4V / WebM，单个不超过 2 GiB。更换视频后可点「重播开场」预览。',
        'intro.motionHint': '系统启用「减少动态效果」时不自动播放，仍可手动重播。',
        'intro.libraryError': '无法读取视频列表。请重启 DSH 后刷新；也可以先关闭启动播放。',
        'intro.openError': '未能打开视频目录，请按下方路径手动打开。',
        'intro.idle': '等待下次启动；可手动重播',
        'intro.loading': '正在加载视频…',
        'intro.waiting': '等待已有开场动画离场…',
        'intro.playing': '正在播放：{name}',
        'intro.fading': '正在淡出…',
        'intro.finished': '开场已结束',
        'intro.empty': '还没有视频。打开视频目录，放入素材后刷新列表。',
        'intro.error': '视频无法播放。请检查文件和编码，刷新后重试；推荐 H.264 MP4 或 VP9 WebM。',
        'intro.skipped': '开场已跳过',
      },
      en: {
        'meta.title': 'Acid Core',
        'meta.description': 'A crystal startup animation, six complete palettes, local wallpapers and background lettering. Choose a background and adjust its veil for clear reading.',
        nav: 'Acid Core',
        'sec.theme': 'Theme',
        'sec.themeHint': 'Picking a tile applies globally. Every palette is a complete theme, not just an accent swap; pick Dark or Light again any time.',
        'theme.light': 'Light',
        'theme.dark': 'Dark',
        'theme.acid': 'Acid Mono',
        'theme.orange': 'Neon Orange',
        'theme.cyan': 'Arc Cyan',
        'theme.violet': 'Violet',
        'theme.rose': 'Rose',
        'theme.orangeLight': 'Amber Light',
        'theme.system': 'System',
        'theme.current': 'active',
        'sec.crystal': 'Crystal backdrop',
        'sec.crystalHint': 'Backdrop only: pointer, scroll and sliders write uniforms, never geometry, inside a 60 fps budget.',
        'ctl.distortion': 'distortion',
        'ctl.frequency': 'frequency',
        'ctl.speed': 'time speed',
        'ctl.backdrop': 'backdrop',
        'ctl.statusbar': 'status strip',
        'ctl.reset': 'reset',
        'status.fps': 'FPS',
        'status.dpr': 'DPR',
        'status.gl': 'WebGL',
        'status.theme': 'theme',
        'status.hint': 'Runtime readings: frame rate, pixel ratio, renderer and active palette. Hide it in the crystal card above.',
        'state.fps': 'FPS',
        'chip.active': 'ACID // live',
        'chip.idle': 'ACID // idle',
        'hint.accent': 'Accent lands on interactive controls — send, icons, active state, focus rings; reading surfaces stay calm.',
        'hint.budget': 'No neon in type or long text: acid is a signal, not a surface.',
        'sec.background': 'Background',
        'background.crystal': 'Crystal',
        'background.image': 'Image',
        'background.none': 'None',
        'background.enable': 'Show background',
        'background.imageHint': 'Drop images into the folder below, then refresh. JPG, PNG, WebP, AVIF, GIF and BMP; up to 32 MB each.',
        'background.empty': 'No images yet. Open the folder, add images, then refresh the list.',
        'background.unselected': 'Choose an image or switch back to the crystal.',
        'background.open': 'Open image folder',
        'background.refresh': 'Refresh list',
        'background.loading': 'Reading images…',
        'background.error': 'Cannot read the image folder. Restart DSH, then refresh the list.',
        'background.openError': 'Could not open the folder. Open the path below manually.',
        'background.imageError': 'Could not load the image. Refresh and choose an image, or switch back to the crystal.',
        'background.selected': 'Selected: {name}',
        'background.fit': 'Image fit',
        'background.cover': 'Fill',
        'background.contain': 'Fit',
        'background.veilDark': 'Dark veil',
        'background.veilLight': 'Light veil',
        'background.veilHint': 'The veil follows the theme. Increase it for clearer text; cards, the composer and code blocks keep their surfaces.',
        'sec.banner': 'Background lettering',
        'banner.enable': 'Show lettering',
        'banner.text': 'Text',
        'banner.placeholder': 'Write a short line',
        'banner.opacity': 'Lettering opacity',
        'banner.hint': 'Up to 80 characters. Follows the theme and window size; works with the crystal, an image or a plain background.',
        'diagnostics.title': 'Background diagnostics',
        'diagnostics.version': 'Plugin version',
        'diagnostics.directory': 'Image folder',
        'diagnostics.source': 'Current image',
        'diagnostics.none': 'None selected',
        'diagnostics.state': 'Image state',
        'image.idle': 'Inactive',
        'image.loading': 'Loading',
        'image.ready': 'Displayed',
        'image.error': 'Failed to load',
        'sec.intro': 'Startup animation',
        'intro.enable': 'Play on startup',
        'intro.mode': 'Intro style',
        'intro.animation': 'Built-in crystal animation',
        'intro.video': 'Local video',
        'intro.animationName': 'Crystal startup animation',
        'intro.animationHint': 'No media needed: a wireframe crystal forms, the title appears, then the scene fades into the workspace after about 3 seconds. Once per window session; Esc skips.',
        'intro.select': 'Video',
        'intro.auto': 'Use the newest video',
        'intro.open': 'Open video folder',
        'intro.refresh': 'Refresh videos',
        'intro.replay': 'Replay intro',
        'intro.skip': 'Skip intro',
        'intro.hint': 'Plays once per window session, muted and full-screen, then fades out. MP4 / M4V / WebM, up to 2 GiB each. Replay to preview a new selection.',
        'intro.motionHint': 'Reduced motion disables automatic playback. Manual replay remains available.',
        'intro.libraryError': 'Cannot read videos. Restart DSH and refresh, or disable startup playback.',
        'intro.openError': 'Could not open the video folder. Open the path below manually.',
        'intro.idle': 'Ready for the next startup or manual replay',
        'intro.loading': 'Loading video…',
        'intro.waiting': 'Waiting for the existing intro to leave…',
        'intro.playing': 'Playing: {name}',
        'intro.fading': 'Fading out…',
        'intro.finished': 'Intro finished',
        'intro.empty': 'No videos yet. Open the folder, add a video, then refresh.',
        'intro.error': 'Cannot play this video. Check the file and codec, refresh, then retry. H.264 MP4 or VP9 WebM is recommended.',
        'intro.skipped': 'Intro skipped',
      },
    }

    function fallbackDict() {
      const lang = (typeof document !== 'undefined' && document.documentElement?.lang)
        || (typeof navigator !== 'undefined' && navigator.language)
        || 'zh'
      return /^zh/i.test(String(lang)) ? DICTS.zh : DICTS.en
    }

    function fallbackT(key, vars) {
      const dict = fallbackDict()
      const value = dict[key] ?? DICTS.zh[key] ?? key
      return vars === undefined ? value : value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
    }

    // ── Acid-Mono theme ────────────────────────────────────────────────────
    //
    // A registered theme replaces the active theme wholesale, so it has to be
    // complete: a partial set would leave stock colours on the controls nobody
    // remembered. THEME_BASE is the built-in dark palette (all 101 alias
    // tokens, extracted from this dsh build); THEME_PATCH repaints the
    // surfaces, rules and labels into the acid-neutral ramp. Semantic states,
    // diff colours and syntax colours stay as the host designed them.
    const THEME_BASE = /* @acid-theme-base:begin */ {
      '--dsw-alias-bg-base': 'var(--dsw-static-neutral-bluish-950)',
      '--dsw-alias-bg-document-preview': 'var(--dsw-static-neutral-bluish-950)',
      '--dsw-alias-bg-document-selection': 'color-mix(in srgb, var(--dsw-static-blue-500) 40%, transparent)',
      '--dsw-alias-bg-layer-1': 'var(--dsw-static-neutral-bluish-875)',
      '--dsw-alias-bg-layer-2': 'var(--dsw-static-neutral-bluish-850)',
      '--dsw-alias-bg-layer-3': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-bg-mask-1': '#00000080',
      '--dsw-alias-bg-mask-2': '#0003',
      '--dsw-alias-bg-mask-3': '#0000007a',
      '--dsw-alias-bg-mask-drop': '#272730b3',
      '--dsw-alias-bg-mask-photo': '#000000e0',
      '--dsw-alias-bg-module-platform': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-bg-multi-select': 'var(--dsw-static-neutral-850)',
      '--dsw-alias-bg-overlay': 'var(--dsw-static-neutral-bluish-700)',
      '--dsw-alias-bg-skeleton': '#ffffff14',
      '--dsw-alias-border-inverted': '#ffffff0f',
      '--dsw-alias-border-inverted2': '#ffffff14',
      '--dsw-alias-border-l1': '#ffffff0f',
      '--dsw-alias-border-l2': '#ffffff1f',
      '--dsw-alias-border-l2-darkmode-thin': '#ffffff0f',
      '--dsw-alias-border-l3': '#ffffff29',
      '--dsw-alias-border-l4': '#fff3',
      '--dsw-alias-brand-primary': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-alias-brand-primary-invert': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-alias-brand-primary-new-colorprimary-new-color': 'var(--dsw-static-deepseek-450)',
      '--dsw-alias-brand-text': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-alias-button-contrast-fill': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-alias-button-elevated-fill': 'var(--dsw-static-neutral-bluish-750)',
      '--dsw-alias-button-floating-fill': 'var(--dsw-static-neutral-bluish-850)',
      '--dsw-alias-button-floating-hover': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-button-ghost-active-border': 'var(--dsw-static-neutral-bluish-600)',
      '--dsw-alias-button-ghost-active-fill': 'var(--dsw-static-neutral-bluish-750)',
      '--dsw-alias-button-ghost-active-hover': 'var(--dsw-static-neutral-bluish-700)',
      '--dsw-alias-button-info-fill': 'var(--dsw-static-deepseek-400)',
      '--dsw-alias-button-info-hover': 'var(--dsw-static-deepseek-500)',
      '--dsw-alias-button-primary-dimmed': 'var(--dsw-static-neutral-bluish-750)',
      '--dsw-alias-button-primary-fill': 'var(--dsw-alias-brand-primary)',
      '--dsw-alias-button-primary-hover': 'var(--dsw-static-neutral-bluish-100)',
      '--dsw-alias-button-tool-bar-fill': '#54555780',
      '--dsw-alias-button-tool-bar-fill-invisible': '#1f1f1f5c',
      '--dsw-alias-button-tool-bar-hover': '#54555799',
      '--dsw-alias-code-diff-added': 'var(--dsw-static-green-500-a12)',
      '--dsw-alias-code-diff-deleted': 'var(--dsw-static-red-400-a12)',
      '--dsw-alias-file-diff-added-bg': '#1f3124',
      '--dsw-alias-file-diff-added-gutter': '#132016',
      '--dsw-alias-file-diff-added-marker': '#41c977',
      '--dsw-alias-file-diff-deleted-bg': '#3c1f1b',
      '--dsw-alias-file-diff-deleted-gutter': '#28130e',
      '--dsw-alias-file-diff-deleted-marker': '#fa423e',
      '--dsw-alias-interactive-bg-active': '#ffffff24',
      '--dsw-alias-interactive-bg-hover': '#ffffff14',
      '--dsw-alias-interactive-bg-hover-accent': '#ffffff3d',
      '--dsw-alias-interactive-bg-hover-danger': '#f25a5a26',
      '--dsw-alias-interactive-bg-hover-solid': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-label-caption': 'var(--dsw-static-neutral-bluish-600)',
      '--dsw-alias-label-deep-diving': 'color-mix(in srgb, var(--dsw-static-deepseek-450) 55%, var(--dsw-static-neutral-bluish-400))',
      '--dsw-alias-label-deep-diving-shimmer': 'color-mix(in srgb, var(--dsw-static-blue-300) 65%, var(--dsw-static-deepseek-400))',
      '--dsw-alias-label-dimmed': 'var(--dsw-static-neutral-bluish-750)',
      '--dsw-alias-label-document-preview': 'var(--dsw-static-neutral-bluish-300)',
      '--dsw-alias-label-primary': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-alias-label-primary-bluish': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-alias-label-primary-dimmed': 'var(--dsw-static-neutral-bluish-100)',
      '--dsw-alias-label-primary-foreground': 'var(--dsw-static-neutral-bluish-1000)',
      '--dsw-alias-label-primary-inverted': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-label-secondary': 'var(--dsw-static-neutral-bluish-300)',
      '--dsw-alias-label-shimmer': 'color-mix(in srgb, var(--dsw-static-neutral-00) 45%, transparent)',
      '--dsw-alias-label-tertiary': 'var(--dsw-static-neutral-bluish-400)',
      '--dsw-alias-link': 'var(--dsw-static-deepseek-400)',
      '--dsw-alias-markdown-citation': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-markdown-code-block': 'var(--dsw-static-neutral-bluish-900)',
      '--dsw-alias-markdown-code-block-banner': 'var(--dsw-static-neutral-bluish-850)',
      '--dsw-alias-markdown-code-segment-selected': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-markdown-code-segment-unselected': 'var(--dsw-static-neutral-bluish-900)',
      '--dsw-alias-markdown-inline-code': 'var(--dsw-static-neutral-800)',
      '--dsw-alias-markdown-placeholder': 'var(--dsw-static-neutral-bluish-850)',
      '--dsw-alias-markdown-tag': 'var(--dsw-static-neutral-bluish-850)',
      '--dsw-alias-menu-group-header-fill': '#303136f0',
      '--dsw-alias-menu-icon': 'var(--dsw-alias-label-primary-dimmed)',
      '--dsw-alias-scrollbar-bg-l1': 'var(--dsw-static-neutral-700)',
      '--dsw-alias-scrollbar-bg-l2': 'var(--dsw-static-neutral-600)',
      '--dsw-alias-scrollbar-hover-l1': 'var(--dsw-static-neutral-600)',
      '--dsw-alias-scrollbar-hover-l2': 'var(--dsw-static-neutral-550)',
      '--dsw-alias-state-business-primary': 'var(--dsw-static-deepseek-400)',
      '--dsw-alias-state-business-tertiary': 'var(--dsw-static-deepseek-800)',
      '--dsw-alias-state-error-primary': 'var(--dsw-static-red-400)',
      '--dsw-alias-state-error-secondary': 'var(--dsw-static-red-400)',
      '--dsw-alias-state-idle-primary': 'var(--dsw-static-neutral-600)',
      '--dsw-alias-state-success-primary': 'var(--dsw-static-green-500)',
      '--dsw-alias-state-success-secondary': 'var(--dsw-static-green-400)',
      '--dsw-alias-state-success-tertiary': 'var(--dsw-static-green-900)',
      '--dsw-alias-state-warn-label': 'var(--dsw-static-amber-600)',
      '--dsw-alias-state-warn-primary': 'var(--dsw-static-amber-500)',
      '--dsw-alias-state-warn-secondary': 'var(--dsw-static-amber-400)',
      '--dsw-alias-state-warn-tertiary': 'var(--dsw-static-amber-900)',
      '--dsw-alias-switch-thumb': 'var(--dsw-static-neutral-bluish-400)',
      '--dsw-alias-toast-bg': 'var(--dsw-static-neutral-bluish-750)',
      '--dsw-alias-toast-label': 'var(--dsw-static-neutral-bluish-00)',
      '--dsw-alias-tooltip-bg': 'var(--dsw-static-neutral-bluish-750)',
      '--dsw-alias-tooltip-key-bg': 'color-mix(in srgb, var(--dsw-alias-tooltip-bg), white 18%)',
      '--dsw-alias-turn-trigger-bg': 'var(--dsw-alias-interactive-bg-hover)',
      '--dsw-alias-turn-trigger-bg-hover': 'var(--dsw-alias-interactive-bg-active)',
    } /* @acid-theme-base:end */

    const THEME_PATCH = {
      // canvas / surfaces: matte black-blue, never #000
      '--dsw-alias-bg-base': '#08090C',
      '--dsw-alias-bg-document-preview': '#0B0D12',
      '--dsw-alias-bg-layer-1': '#101218',
      '--dsw-alias-bg-layer-2': '#101218',
      '--dsw-alias-bg-layer-3': '#0B0D12',
      '--dsw-alias-bg-module-platform': '#101218',
      '--dsw-alias-bg-multi-select': '#161B26',
      '--dsw-alias-bg-overlay': '#151A24',
      '--dsw-alias-bg-skeleton': '#FFFFFF0A',
      '--dsw-alias-settings-card-fill': '#0B0D12',
      '--dsw-alias-settings-card-stroke': '#1E2330',
      // hairlines
      '--dsw-alias-border-l1': '#1E2330',
      '--dsw-alias-border-l2': '#1E2330',
      '--dsw-alias-border-l2-darkmode-thin': '#1E2330',
      '--dsw-alias-border-l3': '#2B3346',
      '--dsw-alias-border-l4': '#2B3346',
      // reading surfaces: high contrast, low stimulation
      '--dsw-alias-label-primary': '#F1F5F9',
      '--dsw-alias-label-primary-foreground': '#F1F5F9',
      '--dsw-alias-label-primary-dimmed': '#A8B4C4',
      '--dsw-alias-label-primary-inverted': '#08090C',
      '--dsw-alias-label-primary-bluish': '#B6C4D6',
      '--dsw-alias-label-secondary': '#8B99AC',
      '--dsw-alias-label-tertiary': '#8B99AC',
      '--dsw-alias-label-dimmed': '#64748B',
      '--dsw-alias-label-caption': '#64748B',
      // `markdown-inline-code` is a **background** token (the inline-code chip
      // is `background-color: var(--dsw-alias-markdown-inline-code)` with the
      // text inheriting `label-primary`). Painting it with the code *text*
      // colour is what produced light chips with unreadable labels.
      '--dsw-alias-markdown-inline-code': '#1B2130',
      '--dsw-alias-markdown-code-block': '#0B0D12',
      '--dsw-alias-markdown-code-block-banner': '#0A0C11',
      '--dsw-alias-markdown-placeholder': '#64748B',
      // the ≤5% accent band
      '--dsw-alias-state-business-primary': '#CCFF00',
      '--dsw-alias-state-business-tertiary': '#CCFF0014',
      // the "brand blue" family: every saturated blue in the dark palette is
      // pinned to `--dsw-static-deepseek-*`, so absorbing those five tokens is
      // what turns the send button, the active-workspace icon and links acid.
      '--dsw-alias-brand-primary-new-colorprimary-new-color': '#CCFF00',
      '--dsw-alias-button-info-fill': '#CCFF00',
      '--dsw-alias-button-info-hover': '#D9FF57',
      '--dsw-alias-link': '#CCFF00',
      '--dsw-alias-label-deep-diving': '#CCFF00',
      '--dsw-alias-label-deep-diving-shimmer': '#D9FF57',
      '--dsw-alias-bg-document-selection': 'color-mix(in srgb, #CCFF00 38%, transparent)',
      '--dsw-alias-interactive-bg-hover': '#FFFFFF0D',
      '--dsw-alias-interactive-bg-hover-solid': '#161B26',
      '--dsw-alias-interactive-bg-hover-accent': '#CCFF001A',
      '--dsw-alias-interactive-bg-active': '#FFFFFF14',
      // chrome that must not glow
      '--dsw-alias-toast-bg': '#141A24',
      '--dsw-alias-toast-label': '#F1F5F9',
      '--dsw-alias-tooltip-bg': '#1A2130',
      '--dsw-alias-scrollbar-hover-l1': '#2B3346',
      '--dsw-alias-scrollbar-hover-l2': '#2B3346',
      '--dsw-alias-menu-group-header-fill': '#101218F0',

      // ── non-alias surfaces ────────────────────────────────────────────────
      // These are the tokens a theme cannot reach through `--dsw-alias-*`, and
      // they are exactly the ones that stayed light: the user bubble, the
      // composer card, menus and the think-block gradients. The presenter
      // writes every key of the active theme onto `body` as an inline custom
      // property, so they belong in the theme and carry the same undo path.
      '--dsw-specific-bubble': '#151A24',
      '--dsw-specific-bubble-highlight': '#1C2331',
      '--dsw-specific-input-major': '#101218',
      '--dsw-specific-login-input': '#101218',
      '--dsw-specific-menu': '#141A24',
      '--dsw-specific-selector': '#161B26',
      '--dsw-specific-sidebar-fill': '#0B0D12',
      '--dsw-specific-sidebar-nav-item-active': '#161B26',
      '--dsw-specific-sidebar-nav-item-active-accent': '#1E2330',
      '--dsw-specific-sidebar-nav-item-hover': '#FFFFFF0D',
      '--dsw-specific-tip': '#1A2130',
      '--dsw-menu-surface-fill': '#141A24',
      '--dsw-linear-gradient-think': 'linear-gradient(180deg, #12161F 20.19%, #12161F00 100%)',
      '--dsw-linear-think-select': 'linear-gradient(180deg, #1A2130 20.19%, #1A213000 100%)',
    }

    const ACID_TOKENS = Object.freeze({ ...THEME_BASE, ...THEME_PATCH })

    // ── palettes ───────────────────────────────────────────────────────────
    //
    // Every custom theme is a *complete* token set: the dark palettes share the
    // same matte surfaces and only swap the accent family, while the light one
    // starts from the host's own light alias tokens (resolved at runtime, so a
    // host redesign carries over) and repaints the surfaces warm.
    const THEME_SPECS = [
      { id: 'acid-mono', scheme: 'dark', labelKey: 'theme.acid', accent: '#CCFF00', soft: '#D9FF57' },
      { id: 'acid-orange', scheme: 'dark', labelKey: 'theme.orange', accent: '#FF8A00', soft: '#FFB04D' },
      { id: 'acid-cyan', scheme: 'dark', labelKey: 'theme.cyan', accent: '#00E5FF', soft: '#7AF0FF' },
      { id: 'acid-violet', scheme: 'dark', labelKey: 'theme.violet', accent: '#B47CFF', soft: '#CDA6FF' },
      { id: 'acid-rose', scheme: 'dark', labelKey: 'theme.rose', accent: '#FF5C8A', soft: '#FF8AAE' },
      { id: 'acid-orange-light', scheme: 'light', labelKey: 'theme.orangeLight', accent: '#C2410C', soft: '#EA580C' },
    ]
    /** Ids that belong to this bundle; anything else is a stock host theme. */
    const CUSTOM_THEME_IDS = new Set(THEME_SPECS.map((spec) => spec.id))
    /** The theme a first-time user lands on when they pick the bundle's default. */
    const DEFAULT_THEME_ID = THEME_ID

    /**
     * Warm light surface ramp. Only the tokens that would otherwise keep a
     * dark-blue or pure-white fill are listed: everything else rides the host's
     * light alias tokens, so a host palette revision still applies.
     */
    const LIGHT_PATCH = {
      '--dsw-alias-bg-base': '#FFFCF7',
      '--dsw-alias-bg-document-preview': '#FFFCF7',
      '--dsw-alias-bg-layer-1': '#FFF7EE',
      '--dsw-alias-bg-layer-2': '#FFF7EE',
      '--dsw-alias-bg-layer-3': '#FBEEDF',
      '--dsw-alias-bg-module-platform': '#FFF7EE',
      '--dsw-alias-bg-multi-select': '#F6E8D8',
      '--dsw-alias-bg-overlay': '#F3E4D2',
      '--dsw-alias-settings-card-fill': '#FFF7EE',
      '--dsw-alias-settings-card-stroke': '#EAD9C6',
      '--dsw-alias-border-l1': '#EFE3D5',
      '--dsw-alias-border-l2': '#EFE3D5',
      '--dsw-alias-border-l2-darkmode-thin': '#EFE3D5',
      '--dsw-alias-border-l3': '#DFCBB5',
      '--dsw-alias-border-l4': '#DFCBB5',
      '--dsw-alias-label-primary': '#2B2119',
      '--dsw-alias-label-primary-foreground': '#2B2119',
      '--dsw-alias-label-primary-dimmed': '#5A4A3E',
      '--dsw-alias-label-primary-inverted': '#FFFFFF',
      '--dsw-alias-label-primary-bluish': '#4A3B31',
      '--dsw-alias-label-secondary': '#6B584A',
      '--dsw-alias-label-tertiary': '#6B584A',
      '--dsw-alias-label-dimmed': '#8B786A',
      '--dsw-alias-label-caption': '#8B786A',
      '--dsw-alias-markdown-inline-code': '#F6E9DA',
      '--dsw-alias-markdown-code-block': '#FBF3E9',
      '--dsw-alias-markdown-code-block-banner': '#F5EBDE',
      '--dsw-alias-markdown-placeholder': '#9A8574',
      '--dsw-alias-interactive-bg-hover': '#0000000D',
      '--dsw-alias-interactive-bg-hover-solid': '#F3E4D2',
      '--dsw-alias-interactive-bg-active': '#00000014',
      '--dsw-alias-scrollbar-hover-l1': '#DFCBB5',
      '--dsw-alias-scrollbar-hover-l2': '#DFCBB5',
      '--dsw-alias-menu-group-header-fill': '#FFF7EEF0',
      '--dsw-alias-toast-bg': '#F3E4D2',
      '--dsw-alias-toast-label': '#2B2119',
      '--dsw-specific-bubble': '#FFF1E2',
      '--dsw-specific-bubble-highlight': '#FFE7CF',
      '--dsw-specific-input-major': '#FFFFFF',
      '--dsw-specific-login-input': '#FFFFFF',
      '--dsw-specific-menu': '#FFF7EE',
      '--dsw-specific-selector': '#F6E8D8',
      '--dsw-specific-sidebar-fill': '#FFFCF7',
      '--dsw-specific-sidebar-nav-item-active': '#F6E8D8',
      '--dsw-specific-sidebar-nav-item-active-accent': '#EAD9C6',
      '--dsw-specific-sidebar-nav-item-hover': '#0000000A',
      '--dsw-specific-tip': '#F3E4D2',
      '--dsw-menu-surface-fill': '#FFF7EE',
      '--dsw-linear-gradient-think': 'linear-gradient(180deg, #FBF1E5 20.19%, #FBF1E500 100%)',
      '--dsw-linear-think-select': 'linear-gradient(180deg, #F6E8D8 20.19%, #F6E8D800 100%)',
    }

    /**
     * The accent family a palette owns. These are the only tokens a palette
     * changes: saturated accent never lands on a reading surface.
     * @param spec - one entry of THEME_SPECS.
     * @returns the alias tokens that carry the accent.
     */
    function accentPatch(spec) {
      return {
        '--dsw-alias-state-business-primary': spec.accent,
        '--dsw-alias-state-business-tertiary': `${spec.accent}14`,
        '--dsw-alias-brand-primary-new-colorprimary-new-color': spec.accent,
        '--dsw-alias-button-info-fill': spec.accent,
        '--dsw-alias-button-info-hover': spec.soft,
        '--dsw-alias-link': spec.accent,
        '--dsw-alias-label-deep-diving': spec.accent,
        '--dsw-alias-label-deep-diving-shimmer': spec.soft,
        '--dsw-alias-bg-document-selection': `color-mix(in srgb, ${spec.accent} 38%, transparent)`,
        '--dsw-alias-interactive-bg-hover-accent': `${spec.accent}1A`,
      }
    }

    /**
     * Build one complete theme.
     * @param spec - one entry of THEME_SPECS.
     * @param stockLightTokens - the host's light alias tokens, for the light spec.
     * @returns the token map to register.
     */
    function buildThemeTokens(spec, stockLightTokens) {
      const base = spec.scheme === 'light' ? { ...stockLightTokens, ...LIGHT_PATCH } : { ...THEME_BASE, ...THEME_PATCH }
      return { ...base, ...accentPatch(spec) }
    }

    // ── shared parameter store ─────────────────────────────────────────────
    const PARAM_SPEC = {
      distortion: { min: 0, max: 1.5, step: 0.01, value: 0.45 },
      frequency: { min: 0.2, max: 5, step: 0.01, value: 1.8 },
      speed: { min: 0.1, max: 3, step: 0.01, value: 1 },
    }
    const MEDIA_SPEC = {
      veilDark: { min: 0.55, max: 0.98, step: 0.01, value: 0.84 },
      veilLight: { min: 0.55, max: 0.98, step: 0.01, value: 0.90 },
      bannerOpacity: { min: 0.02, max: 0.20, step: 0.01, value: 0.08 },
    }
    const MEDIA_DEFAULTS = { background: 'crystal', image: '', imageFit: 'cover', banner: '', bannerEnabled: false, introEnabled: true, introMode: 'animation', introVideo: '' }

    function normalizeParam(key, value) {
      const spec = PARAM_SPEC[key] ?? MEDIA_SPEC[key]
      if (spec) return typeof value === 'number' && Number.isFinite(value) ? clamp(value, spec.min, spec.max) : undefined
      if (['backdrop', 'statusbar', 'bannerEnabled', 'introEnabled'].includes(key)) return typeof value === 'boolean' ? value : undefined
      if (key === 'background') return ['crystal', 'image', 'none'].includes(value) ? value : undefined
      if (key === 'imageFit') return ['cover', 'contain'].includes(value) ? value : undefined
      if (key === 'introMode') return ['animation', 'video'].includes(value) ? value : undefined
      if (key === 'banner') return typeof value === 'string' ? Array.from(value.replace(/[\r\n\t]/g, ' ')).slice(0, 80).join('') : undefined
      if (key === 'image' || key === 'introVideo') return typeof value === 'string' && !/[\\/\x00-\x1f]/.test(value) && value.length <= 255 ? value : undefined
      return undefined
    }

    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value
    }

    function readStored() {
      try {
        const raw = window.localStorage?.getItem(STORAGE_KEY)
        if (typeof raw !== 'string' || raw === '') return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    const stored = readStored()
    let params = {
      backdrop: typeof stored.backdrop === 'boolean' ? stored.backdrop : true,
      statusbar: typeof stored.statusbar === 'boolean' ? stored.statusbar : true,
      ...MEDIA_DEFAULTS,
      ...Object.fromEntries(Object.entries({ ...PARAM_SPEC, ...MEDIA_SPEC }).map(([key, spec]) => [key, spec.value])),
    }
    for (const key of Object.keys(params)) {
      const value = normalizeParam(key, stored[key])
      if (value !== undefined) params[key] = value
    }
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const listeners = new Set()
    let fps = 0
    let frameAvg = 0
    let publishAccum = 0

    function emit() {
      for (const listener of listeners) listener()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    function getParams() {
      return params
    }

    function getFps() {
      return fps
    }

    function persist() {
      try {
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(params))
      } catch {
        /* storage disabled: parameters live for this page only */
      }
    }

    function setParam(key, value) {
      const next = normalizeParam(key, value)
      if (next === undefined) return
      if (params[key] === next) return
      params = { ...params, [key]: next }
      persist()
      emit()
    }

    function toggleFlag(key) {
      if (typeof params[key] === 'boolean') setParam(key, !params[key])
    }

    function resetParams() {
      const next = { ...params, backdrop: true, statusbar: true }
      for (const [key, spec] of Object.entries(PARAM_SPEC)) next[key] = spec.value
      params = next
      persist()
      emit()
    }

    /** Publish the smoothed frame rate at ~2 Hz; React never sees per-frame churn. */
    function publishFrameTime(dtSeconds) {
      frameAvg = frameAvg === 0 ? dtSeconds : frameAvg * 0.92 + dtSeconds * 0.08
      publishAccum += dtSeconds
      if (publishAccum < 0.5) return
      publishAccum = 0
      const next = Math.round(1 / Math.max(frameAvg, 1 / 240))
      if (next !== fps) {
        fps = next
        emit()
      }
    }

    // ── theme service bridge ───────────────────────────────────────────────
    //
    // The settings page is a slot component without a cordis context, so the
    // service and its `theme/change` stream are bridged through a module-level
    // store: apply() owns the subscription, React only reads snapshots.
    let themeApi
    let themeSnapshot = { preference: 'system', themes: [], active: undefined }
    const themeListeners = new Set()

    function subscribeTheme(listener) {
      themeListeners.add(listener)
      return () => themeListeners.delete(listener)
    }

    function getThemeSnapshot() {
      return themeSnapshot
    }

    function publishTheme(snapshot) {
      if (snapshot === null || typeof snapshot !== 'object') return
      themeSnapshot = snapshot
      for (const listener of themeListeners) listener()
    }

    function selectTheme(id) {
      try {
        // A registered theme id is not part of the host settings schema, so the
        // choice does not survive a restart on its own; remember it here and
        // re-apply on load. Any stock id clears the memory.
        try {
          if (CUSTOM_THEME_IDS.has(id)) window.localStorage?.setItem(THEME_FLAG, id)
          else window.localStorage?.removeItem(THEME_FLAG)
        } catch {
          /* storage disabled */
        }
        themeApi?.setTheme(id)
      } catch (error) {
        console.warn('[dsh-acid-core] theme switch rejected', error)
      }
    }

    /** The remembered palette id, or null. Migrates the old boolean flag. */
    function rememberedTheme() {
      try {
        const raw = window.localStorage?.getItem(THEME_FLAG)
        if (raw === 'on') return DEFAULT_THEME_ID
        return typeof raw === 'string' && CUSTOM_THEME_IDS.has(raw) ? raw : null
      } catch {
        return null
      }
    }

    function forgetAcid() {
      try {
        window.localStorage?.removeItem(THEME_FLAG)
      } catch {
        /* storage disabled */
      }
    }

    // Local library and diagnostics are separate from animation frame updates.
    let library = { images: [], directory: '', loading: false, opening: false, error: false, openError: false, version: '' }
    let scene = { imageState: 'idle' }
    const libraryListeners = new Set()
    const sceneListeners = new Set()
    const subscribeLibrary = (listener) => { libraryListeners.add(listener); return () => libraryListeners.delete(listener) }
    const subscribeScene = (listener) => { sceneListeners.add(listener); return () => sceneListeners.delete(listener) }
    const getLibrary = () => library
    const getScene = () => scene
    let libraryRequest = 0
    let libraryAbort
    let imageAttempt = 0

    function publishLibrary(patch) {
      library = { ...library, ...patch }
      for (const listener of libraryListeners) listener()
    }

    function reportImage(imageState) {
      if (scene.imageState === imageState) return
      scene = { imageState }
      for (const listener of sceneListeners) listener()
    }

    async function refreshLibrary() {
      const request = ++libraryRequest
      libraryAbort?.abort()
      libraryAbort = new AbortController()
      publishLibrary({ loading: true, error: false })
      try {
        const response = await fetch('/acid-core/wallpapers', { cache: 'no-store', signal: libraryAbort.signal })
        if (!response.ok) throw new Error('library unavailable')
        const data = await response.json()
        if (!Array.isArray(data.images) || typeof data.directory !== 'string') throw new Error('invalid library')
        if (request !== libraryRequest) return
        imageAttempt += 1
        publishLibrary({ images: data.images.filter((entry) => entry && typeof entry.name === 'string' && normalizeParam('image', entry.name) === entry.name),
          directory: data.directory, version: typeof data.version === 'string' ? data.version : '', loading: false, error: false })
      } catch (error) {
        if (request === libraryRequest && error.name !== 'AbortError') publishLibrary({ loading: false, error: true })
      }
    }

    async function openWallpaperDirectory() {
      if (library.opening) return
      publishLibrary({ opening: true, openError: false })
      try {
        const response = await fetch('/acid-core/open-wallpapers', { method: 'POST' })
        if (!response.ok || !(await response.json()).ok) throw new Error('open failed')
        publishLibrary({ opening: false })
        await refreshLibrary()
      } catch { publishLibrary({ opening: false, openError: true }) }
    }

    function imageUrl(name) {
      const entry = library.images.find((image) => image.name === name)
      return `/acid-core/wallpaper?name=${encodeURIComponent(name)}${entry ? `&v=${entry.modified}-${entry.size}` : ''}`
    }

    function chooseImage(name) {
      const image = normalizeParam('image', name)
      if (image === undefined || image === '') return
      imageAttempt += 1
      params = { ...params, image, background: 'image', backdrop: true }
      persist()
      emit()
    }

    /**
     * A real background under the app, outside shell.overlay's z-index:20.
     * Inspired by dsh-chat-wallpaper's separate image/veil/lettering layers.
     * Only our scoped stylesheet overrides bg-base, including the presenter's
     * inline token. Removing our attribute restores the latest theme value;
     * never save and later restore a stale inline token from an earlier theme.
     */
    function createMediaLayer() {
      const root = document.createElement('div')
      root.id = 'dsh-acid-media'
      root.setAttribute('aria-hidden', 'true')
      root.setAttribute('data-plugin', PKG)
      root.hidden = true
      const veil = document.createElement('div')
      veil.className = 'dsh-acid-veil'
      const banner = document.createElement('span')
      banner.className = 'dsh-acid-banner'
      root.appendChild(veil)
      root.appendChild(banner)
      document.body.insertBefore(root, document.body.firstChild)
      let disposed = false
      let image = null
      let source = ''
      let loaded = false
      let lastParams, lastTheme, lastImages
      let initialGround
      try { initialGround = getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim() } catch { /* theme not live */ }

      const fitBanner = () => {
        if (!banner.textContent || root.hidden) return
        banner.style.fontSize = '100px'
        const measured = banner.getBoundingClientRect().width
        if (measured > 0) banner.style.fontSize = `${Math.max(12, Math.min(100 * (window.innerWidth * 0.92) / measured, window.innerHeight * 0.32))}px`
      }
      const clearImage = () => {
        if (!image) return
        image.onload = image.onerror = null
        image.removeAttribute('src')
        image.remove()
        image = null
      }
      const refresh = (force = false) => {
        if (disposed) return
        const p = getParams(), theme = getThemeSnapshot(), images = library.images
        if (!force && p === lastParams && theme === lastTheme && images === lastImages) return
        lastParams = p; lastTheme = theme; lastImages = images
        const dark = theme.active?.colorScheme ? theme.active.colorScheme !== 'light'
          : !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches)
        const ground = theme.active?.tokens?.['--dsw-alias-bg-base'] || initialGround || (dark ? '#08090C' : '#FFFCF7')
        root.style.setProperty('--acid-media-ground', ground === 'transparent' ? (dark ? '#08090C' : '#FFFCF7') : ground)
        root.style.setProperty('--acid-media-veil', String(dark ? p.veilDark : p.veilLight))
        root.style.setProperty('--acid-media-ink', dark ? '#F1F5F9' : '#2B2119')
        root.style.setProperty('--acid-banner-color', themeAccentHex(theme) || (dark ? '#F1F5F9' : '#2B2119'))
        root.style.setProperty('--acid-banner-opacity', String(p.bannerOpacity))
        const wanted = p.backdrop && p.background === 'image' && p.image ? `${imageUrl(p.image)}&attempt=${imageAttempt}` : ''
        if (wanted !== source) {
          source = wanted; loaded = false; clearImage()
          reportImage(wanted ? 'loading' : 'idle')
          if (wanted) {
            const candidate = document.createElement('img')
            image = candidate
            candidate.alt = ''
            candidate.decoding = 'async'
            candidate.onload = () => {
              if (disposed || image !== candidate) return
              loaded = true
              root.insertBefore(candidate, veil)
              reportImage('ready')
              refresh(true)
            }
            candidate.onerror = () => {
              if (disposed || image !== candidate) return
              loaded = false
              reportImage('error')
              refresh(true)
            }
            candidate.src = wanted
          }
        }
        if (image) image.style.objectFit = p.imageFit
        veil.hidden = !loaded
        banner.textContent = p.backdrop && p.bannerEnabled ? p.banner.trim() : ''
        banner.hidden = !banner.textContent
        root.hidden = !loaded && !banner.textContent
        if (root.hidden) document.body.removeAttribute('data-acid-media')
        else document.body.setAttribute('data-acid-media', 'on')
        fitBanner()
      }
      const offParams = subscribe(refresh)
      const offTheme = subscribeTheme(refresh)
      const offLibrary = subscribeLibrary(refresh)
      window.addEventListener('resize', fitBanner)
      refresh()
      return () => {
        if (disposed) return
        disposed = true
        offParams(); offTheme(); offLibrary()
        window.removeEventListener('resize', fitBanner)
        clearImage()
        root.remove()
        document.body.removeAttribute('data-acid-media')
        reportImage('idle')
      }
    }

    // Intro playback is independent of the permanent background and its switch.
    const INTRO_SEEN = 'dsh.acid-core.intro.shown'
    let intro = { videos: [], directory: '', loading: false, opening: false, libraryError: false, openError: false, phase: 'idle', name: '' }
    const introListeners = new Set()
    const subscribeIntro = (listener) => { introListeners.add(listener); return () => introListeners.delete(listener) }
    const getIntro = () => intro
    function publishIntro(patch) {
      intro = { ...intro, ...patch }
      for (const listener of introListeners) listener()
    }
    let videoRequest = 0, videoAbort, videoPromise, introPlayer, introShownHere = false

    function refreshVideos(force = false) {
      if (videoPromise && !force) return videoPromise
      const request = ++videoRequest
      videoAbort?.abort()
      videoAbort = new AbortController()
      publishIntro({ loading: true, libraryError: false })
      videoPromise = (async () => {
        try {
          const response = await fetch('/acid-core/videos', { cache: 'no-store', signal: videoAbort.signal })
          if (!response.ok) throw new Error('video library unavailable')
          const data = await response.json()
          if (!Array.isArray(data.videos) || typeof data.directory !== 'string') throw new Error('invalid video library')
          if (request !== videoRequest) return false
          const videos = data.videos.filter((entry) => entry && normalizeParam('introVideo', entry.name) === entry.name && /\.(mp4|m4v|webm)$/i.test(entry.name))
          publishIntro({ videos, directory: data.directory, loading: false, libraryError: false })
          return true
        } catch (error) {
          if (request === videoRequest && error.name !== 'AbortError') publishIntro({ loading: false, libraryError: true })
          return false
        } finally { if (request === videoRequest) videoPromise = undefined }
      })()
      return videoPromise
    }

    async function openVideoDirectory() {
      if (intro.opening) return
      publishIntro({ opening: true, openError: false })
      try {
        const response = await fetch('/acid-core/open-videos', { method: 'POST' })
        if (!response.ok || !(await response.json()).ok) throw new Error('open failed')
        publishIntro({ opening: false })
        await refreshVideos(true)
      } catch { publishIntro({ opening: false, openError: true }) }
    }

    function introAlreadyShown() {
      try { return introShownHere || window.sessionStorage?.getItem(INTRO_SEEN) === '1' } catch { return introShownHere }
    }

    function bootIntroBusy() {
      // Optional compatibility with dsh-startup-screen; dimensions are not a
      // completion signal. The default DSH shell needs no external boot gate.
      const overlay = document.querySelector('#dsh-startup-root')
      return overlay !== null && !/\bdsu-(handoff|gone)\b/.test(overlay.className || '')
    }

    function createIntroPlayer() {
      introPlayer?.dispose()
      let disposed = false, generation = 0, current = null
      let lastEnabled = params.introEnabled, lastVideo = params.introVideo, lastMode = params.introMode

      const release = (phase = 'finished') => {
        const run = current
        current = null
        if (run) {
          cancelAnimationFrame(run.raf)
          if (run.video) {
            run.video.removeEventListener('playing', run.onPlaying)
            run.video.removeEventListener('ended', run.onEnded)
            run.video.removeEventListener('error', run.onError)
            try { run.video.pause(); run.video.removeAttribute('src'); run.video.load() } catch { /* already detached */ }
          }
          run.root.removeEventListener('transitionend', run.onTransition)
          run.skip.removeEventListener('click', run.onSkip)
          document.removeEventListener('keydown', run.onKey, true)
          run.root.remove()
        }
        publishIntro({ phase })
      }
      const finish = () => {
        if (!current || current.fading) return
        if (!current.mounted || reduceMotion) { release(); return }
        current.fading = true
        current.fadeEnd = performance.now() + 650
        current.root.setAttribute('data-phase', 'fading')
        publishIntro({ phase: 'fading' })
      }
      const rememberShown = () => {
        introShownHere = true
        try { window.sessionStorage?.setItem(INTRO_SEEN, '1') } catch { /* private storage */ }
      }
      const animate = (ticket) => {
        const root = document.createElement('div')
        root.id = 'dsh-acid-intro'
        root.setAttribute('data-plugin', PKG)
        const scene = document.createElement('div')
        scene.className = 'dsh-acid-intro-scene'
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '-150 -150 300 300')
        svg.setAttribute('aria-hidden', 'true')
        svg.classList.add('dsh-acid-intro-crystal')
        const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        wire.setAttribute('fill', 'none'); wire.setAttribute('stroke', 'currentColor'); wire.setAttribute('stroke-width', '1.15')
        svg.appendChild(wire)
        const title = document.createElement('div')
        title.className = 'dsh-acid-intro-title'; title.textContent = 'DeepSeek Harness'
        const line = document.createElement('div')
        line.className = 'dsh-acid-intro-line'; line.setAttribute('aria-hidden', 'true')
        const progress = document.createElement('span')
        line.appendChild(progress)
        const skip = document.createElement('button')
        skip.type = 'button'; skip.textContent = fallbackT('intro.skip'); skip.className = 'dsh-acid-intro-skip'
        scene.appendChild(svg); scene.appendChild(title); scene.appendChild(line)
        root.appendChild(scene); root.appendChild(skip)
        const geometry = buildCrystal(1, 1)
        const points = new Float32Array(geometry.positions.length)
        const run = { root, skip, video: null, mounted: false, fading: false, raf: 0, started: performance.now(), playStart: 0 }
        current = run
        const live = () => !disposed && current === run && ticket === generation
        run.onSkip = () => { if (live()) finish() }
        run.onKey = (event) => {
          if (live() && run.mounted && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish() }
        }
        run.onTransition = (event) => { if (live() && run.fading && event.target === root && event.propertyName === 'opacity') release() }
        root.addEventListener('transitionend', run.onTransition)
        skip.addEventListener('click', run.onSkip)
        document.addEventListener('keydown', run.onKey, true)
        const paint = (elapsed) => {
          const seconds = elapsed / 1000
          const reveal = reduceMotion ? 1 : 1 - Math.pow(1 - Math.min(1, elapsed / 1100), 3)
          const scale = 0.35 + 0.65 * reveal
          const angle = reduceMotion ? 0.6 : seconds * 0.65 + 0.3
          const cos = Math.cos(angle), sin = Math.sin(angle), tilt = -0.35
          for (let i = 0; i < geometry.positions.length; i += 3) {
            const x = geometry.positions[i], y = geometry.positions[i + 1], z = geometry.positions[i + 2]
            const rx = x * cos + z * sin, rz = z * cos - x * sin
            const ry = y * Math.cos(tilt) - rz * Math.sin(tilt), depth = y * Math.sin(tilt) + rz * Math.cos(tilt)
            const perspective = 4 / (4 - depth)
            points[i] = rx * 92 * scale * perspective
            points[i + 1] = ry * 92 * scale * perspective
          }
          let path = ''
          for (let i = 0; i < geometry.lines.length; i += 2) {
            const a = geometry.lines[i] * 3, b = geometry.lines[i + 1] * 3
            path += `M${points[a].toFixed(2)},${points[a + 1].toFixed(2)}L${points[b].toFixed(2)},${points[b + 1].toFixed(2)}`
          }
          wire.setAttribute('d', path)
          wire.setAttribute('stroke-dasharray', '260')
          wire.setAttribute('stroke-dashoffset', String((1 - reveal) * 260))
          svg.style.opacity = String(reveal)
          const titleReveal = reduceMotion ? 1 : Math.min(1, Math.max(0, (elapsed - 500) / 750))
          title.style.opacity = String(titleReveal)
          title.style.transform = `translateY(${(1 - titleReveal) * 12}px)`
          progress.style.transform = `scaleX(${reduceMotion ? 1 : Math.min(1, elapsed / 2700)})`
          const snapshot = getThemeSnapshot()
          const dark = snapshot.active?.colorScheme !== 'light'
          let ground = snapshot.active?.tokens?.['--dsw-alias-bg-base']
          if (!ground || ground === 'transparent') {
            try { ground = getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-layer-2').trim() } catch { /* theme not ready */ }
          }
          root.style.setProperty('--acid-intro-ground', ground || (dark ? '#08090C' : '#FFFCF7'))
          root.style.setProperty('--acid-intro-ink', dark ? '#F1F5F9' : '#2B2119')
          root.style.setProperty('--acid-intro-accent', themeAccentHex(snapshot) || (dark ? '#CCFF00' : '#C2410C'))
        }
        const watch = (now) => {
          if (!live()) return
          if (document.hidden) { release('skipped'); return }
          if (!run.mounted) {
            if (bootIntroBusy()) {
              if (now - run.started >= 10000) { release('skipped'); return }
              run.raf = requestAnimationFrame(watch); return
            }
            run.playStart = now
            paint(0)
            document.body.appendChild(root); run.mounted = true
            rememberShown()
            publishIntro({ phase: 'playing', name: fallbackT('intro.animationName') })
          }
          if (run.fading) {
            if (now >= run.fadeEnd) { release(); return }
          } else {
            const elapsed = now - run.playStart
            paint(elapsed)
            if (elapsed >= (reduceMotion ? 700 : 2700)) finish()
          }
          if (live()) run.raf = requestAnimationFrame(watch)
        }
        publishIntro({ phase: bootIntroBusy() ? 'waiting' : 'loading' })
        run.raf = requestAnimationFrame(watch)
      }
      const play = async (manual = false) => {
        const ticket = ++generation
        release('idle')
        if (disposed || (!manual && (!params.introEnabled || reduceMotion || introAlreadyShown()))) return
        if (params.introMode === 'animation') { animate(ticket); return }
        publishIntro({ phase: 'loading' })
        const available = await refreshVideos()
        if (disposed || ticket !== generation) return
        if (!manual && !params.introEnabled) { release('idle'); return }
        if (!available) { release('error'); return }
        const selected = params.introVideo ? intro.videos.find((entry) => entry.name === params.introVideo) : intro.videos[0]
        if (!selected) { release(params.introVideo ? 'error' : 'empty'); return }
        const root = document.createElement('div')
        root.id = 'dsh-acid-intro'
        root.setAttribute('data-plugin', PKG)
        const video = document.createElement('video')
        video.muted = true; video.defaultMuted = true; video.playsInline = true
        video.preload = 'auto'; video.loop = false
        video.setAttribute('aria-hidden', 'true')
        const skip = document.createElement('button')
        skip.type = 'button'; skip.textContent = fallbackT('intro.skip'); skip.className = 'dsh-acid-intro-skip'
        root.appendChild(video); root.appendChild(skip)
        const run = { root, video, skip, raf: 0, mounted: false, begun: false, fading: false,
          started: performance.now(), lastProgress: performance.now(), lastTime: 0 }
        current = run
        const live = () => !disposed && current === run && generation === ticket
        run.onPlaying = () => {
          if (!live() || run.fading) return
          if (!run.mounted) { document.body.appendChild(root); run.mounted = true }
          rememberShown()
          run.lastProgress = performance.now()
          publishIntro({ phase: 'playing', name: selected.name })
        }
        run.onEnded = () => { if (live()) finish() }
        run.onError = () => { if (live()) release('error') }
        run.onSkip = () => { if (live()) finish() }
        run.onKey = (event) => {
          if (event.key === 'Escape' && run.mounted && live()) { event.preventDefault(); event.stopPropagation(); finish() }
        }
        run.onTransition = (event) => { if (live() && run.fading && event.target === root && event.propertyName === 'opacity') release() }
        video.addEventListener('playing', run.onPlaying)
        video.addEventListener('ended', run.onEnded)
        video.addEventListener('error', run.onError)
        root.addEventListener('transitionend', run.onTransition)
        skip.addEventListener('click', run.onSkip)
        document.addEventListener('keydown', run.onKey, true)
        video.src = `/acid-core/video?name=${encodeURIComponent(selected.name)}&v=${selected.modified}-${selected.size}`
        try { video.load() } catch { release('error'); return }
        publishIntro({ phase: bootIntroBusy() ? 'waiting' : 'loading', name: selected.name })
        const watch = (now) => {
          if (!live()) return
          if (document.hidden) { release('skipped'); return }
          if (run.fading) {
            if (now >= run.fadeEnd) { release(); return }
          } else if (!run.begun) {
            if (bootIntroBusy()) {
              if (now - run.started >= 10000) { release('skipped'); return }
            } else {
              run.begun = true; run.lastProgress = now
              try { Promise.resolve(video.play()).catch(() => { if (live()) release('error') }) }
              catch { release('error'); return }
            }
          } else {
            if (video.currentTime > run.lastTime) { run.lastTime = video.currentTime; run.lastProgress = now }
            if (video.ended) { finish(); if (!live()) return }
            else if (now - run.lastProgress >= 12000) { release('error'); return }
          }
          if (live()) run.raf = requestAnimationFrame(watch)
        }
        run.raf = requestAnimationFrame(watch)
      }
      const onVisibility = () => { if (document.hidden && current) release('skipped') }
      document.addEventListener('visibilitychange', onVisibility)
      const offParams = subscribe(() => {
        if (lastEnabled === params.introEnabled && lastVideo === params.introVideo && lastMode === params.introMode) return
        lastEnabled = params.introEnabled; lastVideo = params.introVideo; lastMode = params.introMode
        generation += 1; release('idle')
      })
      const controller = { play, dispose() {
        if (disposed) return
        disposed = true; generation += 1
        offParams(); document.removeEventListener('visibilitychange', onVisibility)
        release('idle')
        if (introPlayer === controller) introPlayer = undefined
      } }
      introPlayer = controller
      void play()
      return () => controller.dispose()
    }

    function replayIntro() { return introPlayer?.play(true) }

    // ── geometry: one icosahedron, subdivided once, reused forever ─────────
    //
    // IcosahedronGeometry(detail) equivalent: each of the 20 faces is split on
    // a barycentric grid and every vertex is projected onto the unit sphere.
    // detail 20 -> 20 * 20² = 8000 faces, 4620 vertices, 12600 line segments,
    // which fits Uint16 indices with room to spare.
    function buildCrystal(detail, radius = 1) {
      const t = (1 + Math.sqrt(5)) / 2
      const corners = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
      ]
      const faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
      ]

      const unit = corners.map(([x, y, z]) => {
        const length = Math.hypot(x, y, z)
        return [x / length, y / length, z / length]
      })

      const n = Math.max(1, Math.round(detail))
      const rowStart = (row) => row * (n + 1) - (row * (row - 1)) / 2
      const vertsPerFace = ((n + 1) * (n + 2)) / 2
      const faceCount = faces.length
      const positions = new Float32Array(vertsPerFace * faceCount * 3)
      const lines = new Uint16Array(faceCount * (2 * n * n + n) * 2)

      let vp = 0
      let ip = 0
      for (const [ia, ib, ic] of faces) {
        const a = unit[ia]
        const b = unit[ib]
        const c = unit[ic]
        const base = vp / 3
        for (let i = 0; i <= n; i += 1) {
          for (let j = 0; j <= n - i; j += 1) {
            const u = i / n
            const v = j / n
            const w = 1 - u - v
            let x = a[0] * w + b[0] * u + c[0] * v
            let y = a[1] * w + b[1] * u + c[1] * v
            let z = a[2] * w + b[2] * u + c[2] * v
            const length = Math.hypot(x, y, z) || 1
            x = (x / length) * radius
            y = (y / length) * radius
            z = (z / length) * radius
            positions[vp] = x
            positions[vp + 1] = y
            positions[vp + 2] = z
            vp += 3
          }
        }
        // One LINES pass over the triangle grid, every grid edge exactly once
        // (a duplicated edge would double-brighten under additive blending).
        for (let i = 0; i < n; i += 1) {
          const r0 = base + rowStart(i)
          const r1 = base + rowStart(i + 1)
          for (let j = 0; j < n - i; j += 1) {
            const a0 = r0 + j
            const a1 = r1 + j
            if (i === 0) {
              lines[ip] = a0
              lines[ip + 1] = r0 + j + 1
              ip += 2
            }
            lines[ip] = a0
            lines[ip + 1] = a1
            ip += 2
            if (j < n - i - 1) {
              lines[ip] = r0 + j + 1
              lines[ip + 1] = a1 + 1
              ip += 2
              lines[ip] = a1
              lines[ip + 1] = a1 + 1
              ip += 2
            } else {
              lines[ip] = r0 + j + 1
              lines[ip + 1] = a1
              ip += 2
            }
          }
        }
      }

      return {
        positions,
        lines: lines.subarray(0, ip),
        vertexCount: vp / 3,
        faceCount: faceCount * n * n,
        segments: ip / 2,
      }
    }

    // ── shaders ────────────────────────────────────────────────────────────
    const VERTEX_SHADER = `
precision highp float;

attribute vec3 aPos;

uniform mat4 uProj;
uniform float uTime;
uniform float uDistortion;
uniform float uFrequency;
uniform float uScroll;
uniform vec2 uMouse;

varying float vWave;
varying float vFresnel;
varying float vDepth;
varying vec2 vScreen;

void main() {
  vec3 n = normalize(aPos);
  float t = uTime;
  float f = uFrequency;

  // Three offset sines read as a cheap volumetric wave field, evaluated on the
  // sphere normal so crests travel across the surface instead of pulsing.
  float w1 = sin(n.y * f * 2.10 + t * 1.35);
  float w2 = sin(n.z * f * 3.30 - t * 0.95 + 1.7);
  float w3 = sin(n.x * f * 1.70 + t * 1.10 + 4.2);
  float wave = w1 * 0.50 + w2 * 0.30 + w3 * 0.20;

  // Pointer influence: a local bump around the direction the cursor points at.
  vec3 pointerDir = normalize(vec3(uMouse.x * 1.35, -uMouse.y * 1.35, 0.85));
  float hit = pow(max(dot(n, pointerDir), 0.0), 3.0);

  float amp = uDistortion * (0.30 + 0.22 * abs(uScroll));
  vec3 p = n * (1.0 + wave * amp + hit * amp * 0.85);
  p.z *= 1.0 - uScroll * 0.22;

  // Parallax tilt from the smoothed pointer position.
  float yaw = uMouse.x * 0.34;
  float pitch = -uMouse.y * 0.26;
  float cy = cos(yaw);
  float sy = sin(yaw);
  float cp = cos(pitch);
  float sp = sin(pitch);
  vec3 r = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  r = vec3(r.x, cp * r.y - sp * r.z, sp * r.y + cp * r.z);

  vec3 view = r - vec3(0.0, 0.0, 3.15);
  gl_Position = uProj * vec4(view, 1.0);

  vWave = wave;
  vFresnel = pow(1.0 - clamp(abs(dot(normalize(r), vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 1.7);
  vDepth = clamp(1.0 - (-view.z - 1.9) / 2.6, 0.0, 1.0);
  vScreen = gl_Position.xy / max(gl_Position.w, 0.0001);
}
`

    const FRAGMENT_SHADER = `
precision mediump float;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
uniform vec2 uSafeCenter;
uniform vec2 uSafeScale;

varying float vWave;
varying float vFresnel;
varying float vDepth;
varying vec2 vScreen;

void main() {
  // Lime on the crests, cyan in the troughs: the mix is what keeps tens of
  // thousands of lines from reading as one flat neon sheet.
  float mixv = smoothstep(-0.55, 0.65, vWave);
  vec3 col = mix(uColorB, uColorA, mixv);
  col += smoothstep(0.45, 0.95, vWave) * 0.18;

  float alpha = uOpacity * (0.10 + 0.62 * vFresnel) * (0.35 + 0.65 * vDepth);

  // Reading-column guard, in the shader instead of a CSS mask: the same fade
  // costs nothing here, while a full-screen mask layer would force an extra
  // composite pass every frame. Inside the guard the lines drop to a whisper.
  vec2 guard = (vScreen - uSafeCenter) * uSafeScale;
  alpha *= mix(0.05, 1.0, smoothstep(0.0, 1.0, length(guard)));

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
}
`

    function perspectiveMatrix(fovDeg, aspect, near, far) {
      const f = 1 / Math.tan((fovDeg * Math.PI) / 360)
      const nf = 1 / (near - far)
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
      ])
    }

    function hexToRgb(hex) {
      const value = hex.replace('#', '')
      return [
        parseInt(value.slice(0, 2), 16) / 255,
        parseInt(value.slice(2, 4), 16) / 255,
        parseInt(value.slice(4, 6), 16) / 255,
      ]
    }

    /**
     * WebGL backdrop. Returns undefined when the browser refuses a context:
     * a profile without WebGL simply gets no crystal, never a blank screen or
     * a thrown slot entry.
     */
    function createBackdrop(canvas, crystal, accentHex) {
      const options = { alpha: true, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power' }
      const gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options)
      if (gl === null || gl === undefined) return undefined
      if (gl.isContextLost?.() === true) {
        canvas.hidden = true
        return undefined
      }
      canvas.hidden = false

      const compile = (type, source) => {
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(shader)
          gl.deleteShader(shader)
          throw new Error(`acid-core shader: ${log}`)
        }
        return shader
      }

      let program
      try {
        program = gl.createProgram()
        const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER)
        const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`acid-core link: ${gl.getProgramInfoLog(program)}`)
      } catch (error) {
        console.warn('[dsh-acid-core] backdrop disabled', error)
        return undefined
      }

      gl.useProgram(program)

      const positionBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, crystal.positions, gl.STATIC_DRAW)
      const lineBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, crystal.lines, gl.STATIC_DRAW)

      const attr = gl.getAttribLocation(program, 'aPos')
      gl.enableVertexAttribArray(attr)
      gl.vertexAttribPointer(attr, 3, gl.FLOAT, false, 0, 0)

      const uniform = (name) => gl.getUniformLocation(program, name)
      const uTime = uniform('uTime')
      const uDistortion = uniform('uDistortion')
      const uFrequency = uniform('uFrequency')
      const uScroll = uniform('uScroll')
      const uMouse = uniform('uMouse')
      const uProj = uniform('uProj')
      const uColorA = uniform('uColorA')
      const uColorB = uniform('uColorB')
      const uOpacity = uniform('uOpacity')
      const uSafeCenter = uniform('uSafeCenter')
      const uSafeScale = uniform('uSafeScale')

      // The guard is expressed in NDC, so it is resolution independent: the
      // centre sits slightly below the middle (header/tabs take the top) and
      // the scale maps the body-text ellipse onto the unit circle.
      gl.uniform2f(uSafeCenter, 0.0, 0.06)
      gl.uniform2f(uSafeScale, 1.72, 1.92)

      gl.disable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
      gl.clearColor(0, 0, 0, 0)

      let COLOR_LIME = hexToRgb(typeof accentHex === 'string' && /^#[0-9a-f]{6}$/i.test(accentHex) ? accentHex : '#CCFF00')
      const COLOR_CYAN = hexToRgb('#00F0FF')

      const mouse = [0, 0]
      const target = [0, 0]
      let scroll = 0
      let scrollTarget = 0
      let clock = 0
      let aspect = 1
      let dpr = Math.min(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, 1.25)
      let raf = 0
      let last = 0
      let acc = 0
      let active = true
      let contextLost = false
      let quiet = false
      let opacity = 0.92
      let probeTick = 0

      const resize = () => {
        const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
        const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        aspect = width / height
        gl.viewport(0, 0, width, height)
        gl.useProgram(program)
        gl.uniformMatrix4fv(uProj, false, perspectiveMatrix(42, aspect, 0.1, 20))
      }

      const draw = (opacityValue = 0.92) => {
        if (contextLost) return
        const p = params
        gl.useProgram(program)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform1f(uTime, clock)
        gl.uniform1f(uDistortion, p.distortion)
        gl.uniform1f(uFrequency, p.frequency)
        gl.uniform1f(uScroll, scroll)
        gl.uniform2f(uMouse, mouse[0], mouse[1])
        gl.uniform3f(uColorA, COLOR_LIME[0], COLOR_LIME[1], COLOR_LIME[2])
        gl.uniform3f(uColorB, COLOR_CYAN[0], COLOR_CYAN[1], COLOR_CYAN[2])
        gl.uniform1f(uOpacity, opacityValue * (p.backdrop ? 1 : 0))
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuffer)
        gl.drawElements(gl.LINES, crystal.lines.length, gl.UNSIGNED_SHORT, 0)
      }

      const frame = (now) => {
        if (!active || contextLost || document.hidden) { raf = 0; return }
        raf = requestAnimationFrame(frame)
        const raw = last === 0 ? 1 / 60 : (now - last) / 1000
        last = now
        // A 165 Hz panel has no business drawing this 165 times a second: the
        // budget is one frame per 60 Hz tick; the rest are skipped.
        acc += raw
        if (acc < 1 / 61) return
        const dt = Math.min(acc, 0.1)
        acc = 0

        clock += dt * params.speed
        const ease = 1 - Math.exp(-dt * 7)
        mouse[0] += (target[0] - mouse[0]) * ease
        mouse[1] += (target[1] - mouse[1]) * ease
        scroll += (scrollTarget - scroll) * ease

        // Once the transcript carries real content the crystal retreats: this
        // is the "animation converges into a background" contract. One probe
        // per second on the host's semantic class suffixes; a miss is free.
        probeTick += 1
        if (probeTick >= 60) {
          probeTick = 0
          quiet = document.querySelector('[class*="_markdown"], [class*="_reasoning"], [class*="_assistant"]') !== null
        }
        const targetOpacity = quiet ? 0.24 : 0.92
        opacity += (targetOpacity - opacity) * Math.min(1, ease * 0.35)

        draw(opacity)
        publishFrameTime(dt)
        if (dpr > 1 && 1 / Math.max(dt, 0.001) < 45) {
          dpr = 1
          resize()
        }
      }

      const onPointerMove = (event) => {
        const width = window.innerWidth || 1
        const height = window.innerHeight || 1
        target[0] = (event.clientX / width) * 2 - 1
        target[1] = (event.clientY / height) * 2 - 1
      }

      const onScroll = (event) => {
        const node = event.target
        const top = typeof node.scrollTop === 'number' ? node.scrollTop : 0
        const max = typeof node.scrollHeight === 'number' ? node.scrollHeight - (node.clientHeight ?? 0) : 0
        scrollTarget = max > 0 ? clamp((top / max) * 2 - 1, -1, 1) : 0
      }

      const onResize = () => { resize(); if (reduceMotion) draw() }
      const onVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf)
          raf = 0
        } else if (active && !contextLost && !reduceMotion && raf === 0) {
          resize()
          last = 0
          raf = requestAnimationFrame(frame)
        }
      }

      const onContextLost = (event) => {
        event.preventDefault?.()
        contextLost = true
        canvas.hidden = true
        cancelAnimationFrame(raf)
        raf = 0
        fps = 0
        emit()
      }

      resize()
      canvas.addEventListener?.('webglcontextlost', onContextLost)
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('scroll', onScroll, { passive: true, capture: true })
      window.addEventListener('resize', onResize)
      document.addEventListener('visibilitychange', onVisibility)

      if (reduceMotion) {
        clock = 1.4
        draw()
        fps = 0
      } else if (!document.hidden) {
        raf = requestAnimationFrame(frame)
      }

      return {
        setAccent(value) {
          COLOR_LIME = hexToRgb(typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#CCFF00')
          if (reduceMotion && active && !contextLost) draw(opacity)
        },
        dispose() {
          active = false
          if (raf !== 0) cancelAnimationFrame(raf)
          raf = 0
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('scroll', onScroll, true)
          window.removeEventListener('resize', onResize)
          document.removeEventListener('visibilitychange', onVisibility)
          canvas.removeEventListener?.('webglcontextlost', onContextLost)
          gl.deleteBuffer(positionBuffer)
          gl.deleteBuffer(lineBuffer)
          gl.deleteProgram(program)
          // React can reuse this canvas after an effect cleanup. Explicitly
          // losing its context permanently poisons that canvas; Chromium may
          // then composite it as an opaque white full-screen surface.
          fps = 0
          emit()
        },
      }
    }

    // ── components ─────────────────────────────────────────────────────────

    /**
     * Normalise a CSS colour to `#rrggbb`. The theme snapshot hands back the
     * literal token value, but the fallback path reads a computed custom
     * property, which browsers serialise as `rgb(...)`.
     * @param value - a hex or rgb()/rgba() string.
     * @returns `#rrggbb`, or undefined when the value is not a plain colour.
     */
    function colorToHex(value) {
      if (typeof value !== 'string') return undefined
      const raw = value.trim()
      if (/^#[0-9a-f]{6}$/i.test(raw)) return raw
      const match = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\b/i)
      if (match === null) return undefined
      const part = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')
      return `#${part(match[1])}${part(match[2])}${part(match[3])}`
    }

    /**
     * Which accent colour the backdrop should draw with, read from the active
     * theme's tokens (or the live custom property) so the crystal follows the
     * palette instead of staying lime on an orange shell.
     * @param snapshot - the theme snapshot.
     * @returns a `#rrggbb` value, or undefined to keep the default.
     */
    function themeAccentHex(snapshot) {
      const fromTokens = colorToHex(snapshot?.active?.tokens?.['--dsw-alias-state-business-primary'])
      if (fromTokens !== undefined) return fromTokens
      try {
        return colorToHex(getComputedStyle(document.body).getPropertyValue('--dsw-alias-state-business-primary'))
      } catch {
        /* no body yet */
      }
      return undefined
    }

    /** Module A: a fixed, click-through canvas with the reading-column guard. */
    function AcidBackdrop() {
      const enabled = useSyncExternalStore(subscribe, () => getParams().backdrop && getParams().background === 'crystal')
      const themeSnapshot = useSyncExternalStore(subscribeTheme, getThemeSnapshot)
      const accent = themeAccentHex(themeSnapshot)
      const canvasRef = useRef(null)
      const backdropRef = useRef(null)
      const crystal = React.useMemo(() => buildCrystal(20, 1), [])

      useEffect(() => createMediaLayer(), [])
      useEffect(() => createIntroPlayer(), [])

      useEffect(() => {
        if (!enabled) return undefined
        const canvas = canvasRef.current
        if (canvas === null) return undefined
        let handle
        try {
          handle = createBackdrop(canvas, crystal, accent)
        } catch (error) {
          console.warn('[dsh-acid-core] canvas init failed', error)
          return undefined
        }
        backdropRef.current = handle
        return () => {
          if (backdropRef.current === handle) backdropRef.current = undefined
          handle?.dispose()
        }
      }, [enabled, crystal])

      useEffect(() => {
        backdropRef.current?.setAccent(accent)
      }, [accent, enabled])

      if (!enabled) return null
      return h('div', { className: 'dsh-acid-field', 'data-plugin': PKG, 'aria-hidden': true },
        h('canvas', { ref: canvasRef, className: 'dsh-acid-canvas' }))
    }

    /** One row of the sandbox: label, range input, live value. */
    function ControlRow(props) {
      const { id, label, value, min, max, step, onChange, format } = props
      return h('label', { className: 'dsh-acid-row', htmlFor: `dsh-acid-${id}` },
        h('span', { className: 'dsh-acid-key' }, label),
        h('input', {
          id: `dsh-acid-${id}`,
          className: 'dsh-acid-range',
          type: 'range',
          min,
          max,
          step,
          value,
          onChange: (event) => onChange(Number(event.currentTarget.value)),
        }),
        h('span', { className: 'dsh-acid-val' }, format ? format(value) : Number(value).toFixed(2)))
    }

    /** A labelled switch with explicit pressed state. */
    function Toggle(props) {
      const { label, on, onToggle } = props
      return h('button', {
        type: 'button',
        className: 'dsh-acid-toggle',
        role: 'switch',
        'aria-checked': on ? 'true' : 'false',
        onClick: onToggle,
      },
      h('span', { className: 'dsh-acid-dot', 'data-on': on ? 'true' : 'false' }),
      h('span', null, label))
    }

    /** Theme label: known ids get copy, anything else falls back to its id. */
    function themeLabel(t, id) {
      if (id === 'light') return t('theme.light')
      if (id === 'dark') return t('theme.dark')
      const spec = THEME_SPECS.find((entry) => entry.id === id)
      if (spec !== undefined) return t(spec.labelKey)
      return id
    }

    /** One theme tile: a two-tone swatch, the name, and the active state. */
    function ThemeTile(props) {
      const { theme, active, t, onSelect } = props
      const tokens = theme.tokens ?? {}
      // Preview from the scheme rather than from the token values: a stock
      // theme's tokens are `var(--dsw-static-*)` references, which resolve in
      // the *active* palette and would preview the current theme, not the tile.
      const light = theme.colorScheme === 'light'
      const canvas = light ? '#F5F7F8' : '#08090C'
      const bar = light ? '#0B0F14' : '#F1F5F9'
      const accent = tokens['--dsw-alias-state-business-primary'] ?? (light ? '#5F7D00' : '#CCFF00')
      return h('button', {
        type: 'button',
        className: 'dsh-acid-tile',
        'data-active': active ? 'true' : 'false',
        'aria-pressed': active ? 'true' : 'false',
        onClick: () => onSelect(theme.id),
        title: theme.id,
      },
      h('span', { className: 'dsh-acid-swatch', style: { background: canvas, borderColor: light ? '#DCE1E8' : '#1E2330' } },
        h('span', { className: 'dsh-acid-swatch-bar', style: { background: bar, opacity: 0.9 } }),
        h('span', { className: 'dsh-acid-swatch-bar', style: { background: bar, opacity: 0.55, width: '62%' } }),
        h('span', { className: 'dsh-acid-swatch-bar', style: { background: bar, opacity: 0.3, width: '74%' } }),
        h('span', { className: 'dsh-acid-swatch-accent', style: { background: accent } })),
      h('span', { className: 'dsh-acid-tile-name' }, themeLabel(t, theme.id)),
      h('span', { className: 'dsh-acid-tile-meta' }, active ? t('theme.current') : theme.colorScheme))
    }

    function IntroSettings({ t }) {
      const current = useSyncExternalStore(subscribe, getParams)
      const info = useSyncExternalStore(subscribeIntro, getIntro)
      useEffect(() => {
        if (current.introMode === 'video') void refreshVideos()
      }, [current.introMode])
      return h('section', { className: 'dsh-acid-card', 'data-acid-section': 'intro' },
        h('div', { className: 'dsh-acid-card-head' },
          h('h3', { className: 'dsh-acid-card-title' }, t('sec.intro')),
          h(Toggle, { label: t('intro.enable'), on: current.introEnabled, onToggle: () => toggleFlag('introEnabled') })),
        h('label', { className: 'dsh-acid-select-row' }, h('span', null, t('intro.mode')),
          h('select', { className: 'dsh-acid-select dsh-acid-intro-select', value: current.introMode,
            onChange: (event) => setParam('introMode', event.currentTarget.value) },
          ['animation', 'video'].map((mode) => h('option', { key: mode, value: mode }, t(`intro.${mode}`))))),
        h('p', { className: 'dsh-acid-help' }, t(current.introMode === 'animation' ? 'intro.animationHint' : 'intro.hint')),
        current.introMode === 'video' ? h(React.Fragment, null,
          h('label', { className: 'dsh-acid-select-row' }, h('span', null, t('intro.select')),
            h('select', { className: 'dsh-acid-select dsh-acid-intro-select', value: current.introVideo,
              onChange: (event) => setParam('introVideo', event.currentTarget.value) },
            h('option', { value: '' }, t('intro.auto')),
            current.introVideo && !info.videos.some((entry) => entry.name === current.introVideo)
              ? h('option', { value: current.introVideo }, current.introVideo) : null,
            info.videos.map((entry) => h('option', { key: entry.name, value: entry.name }, entry.name)))),
          h('div', { className: 'dsh-acid-library-actions' },
            h('button', { type: 'button', className: 'dsh-acid-mini', disabled: info.opening,
              onClick: () => { void openVideoDirectory() } }, t('intro.open')),
            h('button', { type: 'button', className: 'dsh-acid-mini', disabled: info.loading,
              onClick: () => { void refreshVideos(true) } }, t('intro.refresh'))),
          info.directory ? h('p', { className: 'dsh-acid-path' }, info.directory) : null,
          info.libraryError ? h('p', { role: 'alert', className: 'dsh-acid-error' }, t('intro.libraryError')) : null,
          info.openError ? h('p', { role: 'alert', className: 'dsh-acid-error' }, t('intro.openError')) : null) : null,
        h('div', { className: 'dsh-acid-library-actions' },
          h('button', { type: 'button', className: 'dsh-acid-mini', disabled: info.loading || (current.introMode === 'video' && info.videos.length === 0),
            onClick: () => { void replayIntro() } }, t('intro.replay'))),
        h('p', { role: 'status', 'aria-live': 'polite', className: 'dsh-acid-help' },
          t(current.introMode === 'video' && !info.loading && !info.libraryError && info.videos.length === 0 ? 'intro.empty' : `intro.${info.phase}`, { name: info.name })),
        reduceMotion ? h('p', { className: 'dsh-acid-help' }, t('intro.motionHint')) : null)
    }

    function MediaSettings({ t }) {
      const current = useSyncExternalStore(subscribe, getParams)
      const files = useSyncExternalStore(subscribeLibrary, getLibrary)
      const state = useSyncExternalStore(subscribeScene, getScene)
      useEffect(() => {
        if (current.background === 'image') void refreshLibrary()
      }, [current.background])
      const percent = (value) => `${Math.round(value * 100)}%`
      const mediaControl = (key, label) => h(ControlRow, { key, id: key, label: t(label), ...MEDIA_SPEC[key], value: current[key],
        format: percent, onChange: (value) => setParam(key, value) })
      return h(React.Fragment, null,
        h('section', { className: 'dsh-acid-card' },
          h('div', { className: 'dsh-acid-card-head' },
            h('h3', { className: 'dsh-acid-card-title' }, t('sec.background')),
            h(Toggle, { label: t('background.enable'), on: current.backdrop, onToggle: () => toggleFlag('backdrop') })),
          h('div', { className: 'dsh-acid-modes', role: 'group', 'aria-label': t('sec.background') },
            ['crystal', 'image', 'none'].map((mode) => h('button', { key: mode, type: 'button',
              className: 'dsh-acid-mode', 'aria-pressed': current.background === mode,
              onClick: () => setParam('background', mode) }, t(`background.${mode}`)))),
          current.background === 'image' ? h(React.Fragment, null,
            h('p', { className: 'dsh-acid-help' }, t('background.imageHint')),
            h('div', { className: 'dsh-acid-library-actions' },
              h('button', { type: 'button', className: 'dsh-acid-mini', disabled: files.opening,
                onClick: () => { void openWallpaperDirectory() } }, t('background.open')),
              h('button', { type: 'button', className: 'dsh-acid-mini', disabled: files.loading,
                onClick: () => { void refreshLibrary() } }, t('background.refresh'))),
            files.directory ? h('p', { className: 'dsh-acid-path' }, files.directory) : null,
            h('div', { role: 'status', 'aria-live': 'polite', className: 'dsh-acid-help' },
              files.loading ? t('background.loading') : files.error ? t('background.error')
                : files.images.length === 0 ? t('background.empty')
                  : current.image ? t('background.selected', { name: current.image }) : t('background.unselected')),
            files.openError ? h('p', { role: 'alert', className: 'dsh-acid-error' }, t('background.openError')) : null,
            state.imageState === 'error' ? h('p', { role: 'alert', className: 'dsh-acid-error' }, t('background.imageError')) : null,
            h('div', { className: 'dsh-acid-images', 'aria-label': t('background.image') },
              files.images.map((entry) => h('button', { key: entry.name, type: 'button', className: 'dsh-acid-image-tile',
                'aria-pressed': current.image === entry.name, title: entry.name, onClick: () => chooseImage(entry.name) },
              h('img', { src: imageUrl(entry.name), alt: '', loading: 'lazy', decoding: 'async' }),
              h('span', null, entry.name)))),
            h('label', { className: 'dsh-acid-select-row' }, h('span', null, t('background.fit')),
              h('select', { className: 'dsh-acid-select', value: current.imageFit,
                onChange: (event) => setParam('imageFit', event.currentTarget.value) },
              ['cover', 'contain'].map((fit) => h('option', { key: fit, value: fit }, t(`background.${fit}`))))),
            mediaControl('veilDark', 'background.veilDark'), mediaControl('veilLight', 'background.veilLight'),
            h('p', { className: 'dsh-acid-help' }, t('background.veilHint'))) : null),
        h('section', { className: 'dsh-acid-card' },
          h('div', { className: 'dsh-acid-card-head' },
            h('h3', { className: 'dsh-acid-card-title' }, t('sec.banner')),
            h(Toggle, { label: t('banner.enable'), on: current.bannerEnabled, onToggle: () => toggleFlag('bannerEnabled') })),
          h('label', { className: 'dsh-acid-banner-input' }, h('span', null, t('banner.text')),
            h('input', { type: 'text', className: 'dsh-acid-text', value: current.banner,
              placeholder: t('banner.placeholder'),
              onChange: (event) => setParam('banner', event.currentTarget.value) })),
          mediaControl('bannerOpacity', 'banner.opacity'),
          h('p', { className: 'dsh-acid-help' }, t('banner.hint'))),
        h('details', { className: 'dsh-acid-diagnostics' },
          h('summary', null, t('diagnostics.title')),
          h('dl', null,
            h('dt', null, t('diagnostics.version')), h('dd', null, VERSION),
            h('dt', null, t('diagnostics.directory')), h('dd', null, files.directory || 'DSH_HOME/acid-core/wallpapers'),
            h('dt', null, t('diagnostics.source')), h('dd', null, current.image || t('diagnostics.none')),
            h('dt', null, t('diagnostics.state')), h('dd', null, t(`image.${state.imageState}`)))))
    }

    /** Module B: the Acid Core section inside Settings. */
    function AcidSettings(props) {
      const t = typeof props?.t === 'function' ? props.t : fallbackT
      const snapshot = useSyncExternalStore(subscribeTheme, getThemeSnapshot)
      const current = useSyncExternalStore(subscribe, getParams)
      const frameRate = useSyncExternalStore(subscribe, getFps)

      const preference = snapshot.preference
      const resolved = preference === 'system' ? (snapshot.active?.id ?? '') : preference
      const themes = Array.isArray(snapshot.themes) ? snapshot.themes : []
      const set = useCallback((key, value) => setParam(key, value), [])

      return h('div', { className: 'dsh-acid-settings' },
        h('header', { className: 'dsh-acid-settings-head' },
          h('h2', { className: 'dsh-acid-settings-title' }, t('meta.title')),
          h('p', { className: 'dsh-acid-settings-sub' }, t('meta.description'))),

        h(IntroSettings, { t }),

        h('section', { className: 'dsh-acid-card' },
          h('div', { className: 'dsh-acid-card-head' },
            h('h3', { className: 'dsh-acid-card-title' }, t('sec.theme')),
            h('span', { className: 'dsh-acid-code dsh-acid-chipmark' }, preference === 'system' ? t('theme.system') : themeLabel(t, resolved))),
          h('div', { className: 'dsh-acid-tiles' },
            themes.map((theme) => h(ThemeTile, {
              key: theme.id,
              theme,
              active: resolved === theme.id,
              t,
              onSelect: selectTheme,
            }))),
          h('p', { className: 'dsh-acid-help' }, t('sec.themeHint')),
          h('p', { className: 'dsh-acid-help' }, t('hint.budget'))),

        h(MediaSettings, { t }),

        h('section', { className: 'dsh-acid-card' },
          h('div', { className: 'dsh-acid-card-head' },
            h('h3', { className: 'dsh-acid-card-title' }, t('sec.crystal')),
            h('span', { className: 'dsh-acid-code dsh-acid-chipmark' }, `${frameRate} ${t('state.fps')}`)),
          Object.entries(PARAM_SPEC).map(([id, spec]) => h(ControlRow, {
            key: id,
            id,
            label: t(`ctl.${id}`),
            value: current[id],
            min: spec.min,
            max: spec.max,
            step: spec.step,
            onChange: (value) => set(id, value),
          })),
          h('div', { className: 'dsh-acid-flags' },
            h(Toggle, { label: t('ctl.statusbar'), on: current.statusbar, onToggle: () => toggleFlag('statusbar') }),
            h('button', { type: 'button', className: 'dsh-acid-mini', onClick: resetParams }, t('ctl.reset'))),
          h('p', { className: 'dsh-acid-help' }, t('sec.crystalHint')),
          h('p', { className: 'dsh-acid-help' }, t('hint.accent'))))
    }

    /** Cached WebGL renderer name: probing a second context is not free. */
    let cachedRenderer
    function webglRendererName() {
      if (cachedRenderer !== undefined) return cachedRenderer
      cachedRenderer = null
      try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
        if (gl !== null && gl !== undefined) {
          const info = gl.getExtension('WEBGL_debug_renderer_info')
          const value = info === null || info === undefined
            ? gl.getParameter(gl.RENDERER)
            : gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          if (typeof value === 'string' && value !== '') cachedRenderer = value.length > 44 ? `${value.slice(0, 44)}…` : value
          gl.getExtension('WEBGL_lose_context')?.loseContext()
        }
      } catch {
        cachedRenderer = null
      }
      return cachedRenderer
    }

    /**
     * Module D: the resident status strip in `shell.bottom`. A thin row of
     * numbers that says whether the layer is running and on which palette; the
     * switch lives in Settings so hiding it costs one click.
     */
    function AcidStatus(props) {
      const t = typeof props?.t === 'function' ? props.t : fallbackT
      const enabled = useSyncExternalStore(subscribe, () => getParams().statusbar)
      const frameRate = useSyncExternalStore(subscribe, getFps)
      const snapshot = useSyncExternalStore(subscribeTheme, getThemeSnapshot)
      if (!enabled) return null
      const dpr = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1
      const renderer = webglRendererName()
      const activeId = snapshot?.active?.id
      const themeName = activeId === undefined ? '—' : themeLabel(t, activeId)
      const cells = [
        `${t('status.fps')} ${frameRate}`,
        `${t('status.dpr')} ${dpr.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`,
        renderer === null ? null : `${t('status.gl')} ${renderer}`,
        `${t('status.theme')} ${themeName}`,
      ].filter((cell) => cell !== null)
      return h('div', { className: 'dsh-acid-status', 'data-plugin': PKG, title: t('status.hint') },
        cells.map((cell) => h('span', { key: cell, className: 'dsh-acid-status-cell' }, cell)))
    }

    /** The converged state indicator in the conversation header. */
    function AcidChip(props) {
      const t = typeof props?.t === 'function' ? props.t : fallbackT
      const enabled = useSyncExternalStore(subscribe, () => getParams().backdrop)
      return h('button', {
        type: 'button',
        className: 'dsh-acid-chip',
        'data-plugin': PKG,
        'data-live': enabled ? 'true' : 'false',
        onClick: () => toggleFlag('backdrop'),
        title: t(enabled ? 'chip.active' : 'chip.idle'),
      },
      h('span', { className: 'dsh-acid-chipdot', 'aria-hidden': true }),
      h('span', { className: 'dsh-acid-code' }, enabled ? t('chip.active') : t('chip.idle')))
    }

    // ── stylesheet ─────────────────────────────────────────────────────────
    const CSS = `
:root{
  /* Spec-named tokens: the design contract other surfaces can consume. */
  --bg-canvas:#08090C;
  --bg-surface:#101218;
  --border-subtle:1px solid #1E2330;
  --text-primary:#F1F5F9;
  --text-secondary:#8B99AC;
  --text-code:#CBD5E1;
  /* The only three saturated values in the whole layer. */
  --acid-accent:#CCFF00;
  --acid-accent-soft:#D9FF57;
  --acid-brand-hue:16deg;
  --acid-cyan:#00F0FF;
  --acid-rule:#1E2330;
}

/* The active palette supplies the real accent: the token below is written on
   body by the theme presenter, so every affordance rule follows the palette
   without the stylesheet knowing which one is on. */
body[data-acid-theme="on"]{
  --acid-accent:var(--dsw-alias-state-business-primary);
  --acid-accent-soft:var(--dsw-alias-button-info-hover);
}
/* The whale mark is recoloured through a filter chain; the hue that lands on
   the target accent depends on the palette, so each palette carries its own
   rotation. A miss only means an approximate tint, never a broken mark. */
body[data-acid-theme-id="acid-orange"]{--acid-brand-hue:-24deg}
body[data-acid-theme-id="acid-cyan"]{--acid-brand-hue:114deg}
body[data-acid-theme-id="acid-violet"]{--acid-brand-hue:193deg}
body[data-acid-theme-id="acid-rose"]{--acid-brand-hue:268deg}
body[data-acid-theme-id="acid-orange-light"]{--acid-brand-hue:-24deg}

/* ── A. backdrop ─────────────────────────────────────────────────────── */
.dsh-acid-field{
  position:fixed; inset:0; z-index:0; pointer-events:none;
  opacity:0; animation:dsh-acid-in 900ms ease-out 60ms forwards;
}
.dsh-acid-canvas{display:block;width:100%;height:100%}
.dsh-acid-canvas[hidden]{display:none !important}
/* The host theme presenter writes tokens inline; this override is scoped and
   reversible. It deliberately leaves every other surface token alone. */
body[data-acid-media="on"]{--dsw-alias-bg-base:transparent !important;background:transparent !important}
/* Windows gives AppFrame a sidebar-fill background rather than bg-base.
   Identify the shell by its direct overlay seat, so no build hash is needed.
   Keep sidebar, titlebar, cards and editor surfaces on their own tokens. */
body[data-acid-media="on"] #root :has(> [data-shell-overlay]){background:transparent !important}
#dsh-acid-media{position:fixed;inset:0;z-index:-1;overflow:hidden;
  background:var(--acid-media-ground);pointer-events:none !important}
#dsh-acid-media [hidden],#dsh-acid-media[hidden]{display:none !important}
#dsh-acid-media>*{pointer-events:none !important}
#dsh-acid-media>img{position:absolute;inset:0;width:100%;height:100%;object-position:center}
.dsh-acid-veil{position:absolute;inset:0;background:var(--acid-media-ground);opacity:var(--acid-media-veil)}
.dsh-acid-banner{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  display:block;white-space:nowrap;width:max-content;line-height:1.05;font-weight:800;
  color:var(--acid-banner-color);opacity:var(--acid-banner-opacity);user-select:none}
#dsh-acid-intro{position:fixed;inset:0;z-index:2147482990;overflow:hidden;pointer-events:none;
  background:var(--acid-intro-ground,#08090C);color:var(--acid-intro-ink,#F1F5F9);
  opacity:1;transition:opacity 600ms cubic-bezier(.2,.8,.2,1)}
#dsh-acid-intro[data-phase="fading"]{opacity:0}
#dsh-acid-intro>video{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none}
.dsh-acid-intro-scene{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:28px;background:radial-gradient(ellipse at 50% 45%,color-mix(in srgb,var(--acid-intro-accent) 5%,transparent),transparent 60%)}
.dsh-acid-intro-crystal{display:block;width:min(44vh,300px);height:min(44vh,300px);color:var(--acid-intro-accent)}
.dsh-acid-intro-title{font-size:clamp(24px,4.2vw,46px);font-weight:600;line-height:1.2;letter-spacing:-.025em;text-align:center}
.dsh-acid-intro-line{width:120px;height:1px;background:color-mix(in srgb,var(--acid-intro-accent) 16%,transparent);margin-top:4px}
.dsh-acid-intro-line span{display:block;height:100%;background:var(--acid-intro-accent);transform-origin:left}
#dsh-acid-intro .dsh-acid-intro-skip{position:absolute;top:calc(var(--dsh-frame-top-clearance,0px) + 16px);left:20px;
  pointer-events:auto;border:1px solid #ffffff66;border-radius:6px;padding:8px 14px;
  color:#fff;background:#08090C;cursor:pointer;font:inherit;font-size:12px}
#dsh-acid-intro .dsh-acid-intro-skip:focus-visible{outline:2px solid var(--acid-intro-accent,#CCFF00);outline-offset:4px}
@media(prefers-reduced-motion:reduce){#dsh-acid-intro{transition:none}}
@keyframes dsh-acid-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.dsh-acid-field{animation:none;opacity:1}}

/* ── A→status chip ───────────────────────────────────────────────────── */
.dsh-acid-chip{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;
  background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:3px;
  color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family-code, ui-monospace, monospace);
  font-size:9px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
.dsh-acid-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
.dsh-acid-chipdot{width:5px;height:5px;flex:none;background:var(--dsw-alias-label-dimmed)}
.dsh-acid-chip[data-live="true"] .dsh-acid-chipdot{
  background:var(--acid-accent);box-shadow:0 0 7px var(--acid-accent);
  animation:dsh-acid-pulse 2.4s ease-in-out infinite}
.dsh-acid-code{font-family:var(--dsw-font-family-code, ui-monospace, monospace);
  font-variant-numeric:tabular-nums;letter-spacing:.08em}
@keyframes dsh-acid-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){
  .dsh-acid-chip[data-live="true"] .dsh-acid-chipdot{animation:none}}

/* ── B. settings section ─────────────────────────────────────────────── */
.dsh-acid-settings{display:flex;flex-direction:column;gap:16px;max-width:720px;
  font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dsh-acid-settings-head{display:flex;flex-direction:column;gap:4px}
.dsh-acid-settings-title{margin:0;font-size:15px;line-height:22px;font-weight:600}
.dsh-acid-settings-sub{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-acid-card{display:flex;flex-direction:column;gap:10px;padding:14px 16px;
  background:var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2));
  border:var(--dsw-alias-settings-card-stroke, 1px solid var(--dsw-alias-border-l2));
  border-radius:12px}
.dsh-acid-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.dsh-acid-card-title{margin:0;font-size:12px;line-height:18px;font-weight:600;
  letter-spacing:.12em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dsh-acid-chipmark{font-size:10px;color:var(--dsw-alias-label-tertiary)}

.dsh-acid-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px}
.dsh-acid-tile{display:flex;flex-direction:column;gap:6px;padding:8px;text-align:left;
  background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;transition:border-color 120ms ease}
.dsh-acid-tile:hover{border-color:var(--dsw-alias-border-l4)}
.dsh-acid-tile[data-active="true"]{border-color:var(--acid-accent);
  box-shadow:0 0 0 1px var(--acid-accent) inset}
.dsh-acid-swatch{position:relative;display:flex;flex-direction:column;justify-content:center;gap:4px;
  height:44px;padding:0 9px;border:1px solid;border-radius:7px;overflow:hidden}
.dsh-acid-swatch-bar{display:block;height:3px;width:84%;border-radius:2px}
.dsh-acid-swatch-accent{position:absolute;right:7px;bottom:7px;width:6px;height:6px;border-radius:2px}
.dsh-acid-tile-name{font-size:12px;font-weight:600}
.dsh-acid-tile-meta{font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--dsw-alias-label-tertiary)}

.dsh-acid-row{display:grid;grid-template-columns:96px 1fr 52px;align-items:center;gap:10px}
.dsh-acid-key{font-size:11px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}
.dsh-acid-val{font-family:var(--dsw-font-family-code, ui-monospace, monospace);
  font-variant-numeric:tabular-nums;font-size:11px;text-align:right;color:var(--dsw-alias-label-primary)}
.dsh-acid-range{-webkit-appearance:none;appearance:none;width:100%;height:16px;
  background:transparent;cursor:ew-resize}
.dsh-acid-range::-webkit-slider-runnable-track{height:1px;background:var(--dsw-alias-border-l3)}
.dsh-acid-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:9px;height:9px;
  margin-top:-4px;border-radius:2px;background:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l3)}
.dsh-acid-range:hover::-webkit-slider-thumb,
.dsh-acid-range:focus-visible::-webkit-slider-thumb{
  background:var(--acid-accent);border-color:var(--acid-accent);
  box-shadow:0 0 8px color-mix(in srgb, var(--acid-accent) 55%, transparent)}
.dsh-acid-range::-moz-range-track{height:1px;background:var(--dsw-alias-border-l3)}
.dsh-acid-range::-moz-range-thumb{width:9px;height:9px;border-radius:2px;
  background:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3)}
.dsh-acid-range:focus-visible{outline:1px solid var(--acid-accent);outline-offset:4px}

.dsh-acid-flags{display:flex;align-items:center;gap:10px;padding-top:2px}

/* ── D. resident status strip (shell.bottom) ──────────────────────────── */
.dsh-acid-status{display:flex;align-items:center;height:22px;padding:0 12px;
  overflow:hidden;white-space:nowrap;
  border-top:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-base, #08090C);
  color:var(--dsw-alias-label-tertiary);
  font-family:var(--dsw-font-family-code, ui-monospace, monospace);
  font-size:10px;letter-spacing:.06em;font-variant-numeric:tabular-nums;
  user-select:none;-webkit-user-select:none}
.dsh-acid-status-cell{display:inline-flex;align-items:center;min-width:0;
  overflow:hidden;text-overflow:ellipsis}
.dsh-acid-status-cell+.dsh-acid-status-cell::before{
  content:"·";margin:0 8px;opacity:.45}
.dsh-acid-toggle{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;
  background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.dsh-acid-toggle:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
.dsh-acid-toggle[aria-checked="true"]{color:var(--dsw-alias-label-primary);
  border-color:color-mix(in srgb, var(--acid-accent) 45%, var(--dsw-alias-border-l2))}
.dsh-acid-dot{width:5px;height:5px;background:var(--dsw-alias-label-dimmed);flex:none}
.dsh-acid-dot[data-on="true"]{background:var(--acid-accent);box-shadow:0 0 6px var(--acid-accent)}
.dsh-acid-mini{padding:4px 10px;background:transparent;border:1px solid var(--dsw-alias-border-l2);
  border-radius:5px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.dsh-acid-mini:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
.dsh-acid-help{margin:0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.dsh-acid-modes{display:flex;flex-wrap:wrap;gap:6px}
.dsh-acid-mode{flex:1;min-width:68px;padding:9px 14px;border:1px solid var(--dsw-alias-border-l2);
  border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}
.dsh-acid-mode[aria-pressed="true"]{border-color:var(--acid-accent);color:var(--dsw-alias-label-primary);
  background:color-mix(in srgb,var(--acid-accent) 7%,transparent)}
.dsh-acid-mode:hover,.dsh-acid-image-tile:hover{border-color:var(--dsw-alias-label-secondary)}
.dsh-acid-library-actions{display:flex;flex-wrap:wrap;gap:8px}
.dsh-acid-path{margin:0;overflow-wrap:anywhere;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dsh-acid-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;max-height:320px;overflow:auto}
.dsh-acid-image-tile{display:flex;flex-direction:column;gap:6px;min-width:0;padding:5px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;
  color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;text-align:left}
.dsh-acid-image-tile[aria-pressed="true"]{border-color:var(--acid-accent)}
.dsh-acid-image-tile img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;
  border-radius:3px;background:var(--dsw-alias-bg-layer-2)}
.dsh-acid-image-tile span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.dsh-acid-select-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsh-acid-select,.dsh-acid-text{box-sizing:border-box;min-width:0;padding:7px 9px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary);font:inherit}
.dsh-acid-intro-select{max-width:100%;width:min(70%,420px)}
.dsh-acid-banner-input{display:flex;flex-direction:column;gap:6px}
.dsh-acid-text{width:100%;caret-color:var(--acid-accent)}
.dsh-acid-text::placeholder{color:var(--dsw-alias-label-secondary)}
.dsh-acid-error{margin:0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:19px}
.dsh-acid-diagnostics{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-acid-diagnostics summary{cursor:pointer;padding:6px 0}
.dsh-acid-diagnostics dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 16px;margin:8px 0}
.dsh-acid-diagnostics dd{margin:0;overflow-wrap:anywhere}
.dsh-acid-settings :is(button,input,select,summary):focus-visible{outline:2px solid var(--acid-accent);outline-offset:3px}
.dsh-acid-settings button:disabled{opacity:.5;cursor:wait}
.dsh-acid-settings-head,.dsh-acid-card{min-width:0}
@media(max-width:480px){.dsh-acid-card{padding:12px}.dsh-acid-card-head{flex-wrap:wrap}
  .dsh-acid-row{grid-template-columns:88px minmax(0,1fr) 42px}.dsh-acid-diagnostics dl{grid-template-columns:minmax(0,1fr)}}

/* ── C. theme detail: focus, caret, reasoning fold ───────────────────── */

/* Acid affordances, scoped to the active acid theme.
   These controls paint themselves from ClassNames the host does not expose as
   tokens (the send button reads brand-primary-new-color, the workspace icons
   are _folder, the sidebar call-to-action is _newSession, tool icons are
   _iconButton and _action). The suffixes after the build hash are semantic, so
   the rules survive a host rebuild and simply stop matching if one is renamed —
   a miss only means "stock colour", never a broken layout. */
body[data-acid-theme="on"] :is(button, [role="button"], [class*="_iconButton"], [class*="_action"])[class*="_primary"]:not([class*="_dimmed"]) {
  background-color: var(--acid-accent) !important;
  color: #08090C !important;
  box-shadow: 0 0 14px color-mix(in srgb, var(--acid-accent) 28%, transparent);
}
body[data-acid-theme="on"] :is(button, [role="button"])[class*="_primary"]:not([class*="_dimmed"]):hover {
  background-color: var(--acid-accent-soft) !important;
}
body[data-acid-theme="on"] :is([class*="_iconButton"], [class*="_action"]):not([class*="_danger"]):not([class*="_delete"]) {
  color: color-mix(in srgb, var(--acid-accent) 82%, var(--dsw-alias-label-secondary)) !important;
}
body[data-acid-theme="on"] :is([class*="_iconButton"], [class*="_action"]):not([class*="_danger"]):not([class*="_delete"]):hover {
  color: var(--acid-accent) !important;
}
body[data-acid-theme="on"] :is([class*="_folder"]) {
  color: color-mix(in srgb, var(--acid-accent) 55%, var(--dsw-alias-label-secondary)) !important;
}
body[data-acid-theme="on"] :is([class*="_folderActive"], [class*="_activeIcon"]) {
  color: var(--acid-accent) !important;
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--acid-accent) 40%, transparent));
}
/* The sidebar call-to-action copies the send button: a solid acid fill with a
   dark glyph and the same soft glow. Its label is painted white by the host, so
   the descendant colours are forced too — a white label on lime is the one thing
   this rule must never allow. */
body[data-acid-theme="on"] [class*="_newSession"] {
  background-color: var(--acid-accent) !important;
  color: #08090C !important;
  box-shadow: 0 0 16px color-mix(in srgb, var(--acid-accent) 26%, transparent) !important;
}
body[data-acid-theme="on"] [class*="_newSession"] :is(span, svg, div) {
  color: #08090C !important;
}
body[data-acid-theme="on"] [class*="_newSession"]:hover {
  background-color: var(--acid-accent-soft) !important;
}

/* Brand mark: recolour, do not replace. The whale is a single-colour inline SVG
   whose alpha carries the shape, so a filter chain that maps white to acid keeps
   the silhouette and the transparency intact — no box, no square, no new asset.
   (The multiply overlay this replaces tinted the whole bounding box, which is
   why it read as a lime rectangle.) */
body[data-acid-theme="on"] :is([class*="_brandMark"], [class*="_railMark"], [class*="_fish"]) {
  filter: brightness(0) saturate(100%) invert(89%) sepia(98%) saturate(1600%) hue-rotate(var(--acid-brand-hue, 16deg)) brightness(1.04);
}

/* The wordmark artboard carries both the "deepseek" letters and the HARNESS
   badge pill, so a filter would flatten the badge into one silhouette. Instead:
   letters take the acid through currentColor, and the badge's pill (an SVG
   rect) is filled acid while its dark letters keep their own explicit fill. */
body[data-acid-theme="on"] [class*="_brandName"] {
  color: var(--acid-accent) !important;
}
body[data-acid-theme="on"] [class*="_brandName"] svg > rect:first-of-type {
  fill: var(--acid-accent) !important;
  opacity: 1;
}
/* Badge letters stay dark on the acid pill: whatever they are drawn with (text
   or path), their own fill must not inherit the wordmark colour. */
body[data-acid-theme="on"] [class*="_brandName"] svg text {
  fill: #08090C !important;
}

/* Caret colour only; the blink cadence stays with the platform (see README). */
:where(textarea, input, [contenteditable="true"]){caret-color:var(--acid-accent)}
/* Reasoning (<think>) folds read as a lower layer: smaller, dimmer, and marked
   with hazard striping on their leading edge. Class suffixes are semantic
   (prefixed by the build hash), so the match degrades to "no styling". */
:where([class*="_reasoning"], [class*="_thinking"], [class*="_think"]){position:relative}
:where([class*="_reasoning"], [class*="_thinking"], [class*="_think"])::before{
  content:"";position:absolute;left:-9px;top:0;bottom:0;width:2px;
  background-image:repeating-linear-gradient(-45deg,
    color-mix(in srgb, var(--acid-accent) 42%, transparent) 0 3px, transparent 3px 7px);
  opacity:.5}
:where([class*="_reasoningBody"], [class*="_reasoningContent"], [class*="_reasoningText"]){
  font-size:calc(var(--dsh-content-font-size, 14px) - 1px);
  color:var(--dsw-alias-label-secondary)}
`

    // ── apply ──────────────────────────────────────────────────────────────
    function apply(ctx) {
      /** Locale-bound translator, when the locale service is present. */
      let bindT

      // 1. Stylesheet, owned by this context: unload removes it.
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', PKG)
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'acid-core: styles')

      ctx.effect(() => () => {
        libraryRequest += 1
        libraryAbort?.abort()
        publishLibrary({ loading: false })
        videoRequest += 1
        videoAbort?.abort()
        videoPromise = undefined
        publishIntro({ loading: false })
      }, 'acid-core: library requests')

      // 2. Dictionaries, when the locale service exists.
      ctx.inject(['locale'], (localeCtx) => {
        ctx.effect(() => {
          try {
            bindT = localeCtx.locale.bind(NS)
            return localeCtx.locale.register(NS, DICTS)
          } catch {
            return () => {}
          }
        }, 'acid-core: dictionaries')
      })

      // 3. The palettes. Each one is a complete theme (a partial set would leave
      //    stock colours on controls nobody remembered); the user picks from the
      //    tiles and can leave in one click. The light palette is built on the
      //    host's own light alias tokens so a host redesign carries over.
      ctx.inject(['theme'], (themeCtx) => {
        const theme = themeCtx.theme
        if (theme === undefined || typeof theme.register !== 'function') return
        // The settings write behind a stock theme switch can replace this
        // service. Registrations and listeners must leave with that injected
        // context, otherwise retired services keep publishing old palettes.
        themeCtx.effect(() => {
          themeApi = theme
          // Mirror "one of our palettes is active" onto the body so the
          // affordance layer only exists while a bundle theme is selected, and
          // disappears the moment the user picks a stock theme.
          const push = (snapshot) => {
            publishTheme(snapshot)
            try {
              const id = snapshot?.active?.id
              if (CUSTOM_THEME_IDS.has(id)) {
                document.body.setAttribute('data-acid-theme', 'on')
                document.body.setAttribute('data-acid-theme-id', id)
              } else {
                document.body.removeAttribute('data-acid-theme')
                document.body.removeAttribute('data-acid-theme-id')
              }
            } catch {
              /* no body yet */
            }
          }
          try {
            push(theme.getTheme?.())
          } catch {
            /* snapshot unavailable: tiles render from the next theme/change */
          }
          // The light palette needs a full light alias base; take the host's own
          // so a palette revision is inherited instead of copied.
          let stockLight
          try {
            const themes = theme.getTheme?.()?.themes
            const lightTheme = Array.isArray(themes) ? themes.find((entry) => entry?.id === 'light') : undefined
            const tokens = lightTheme?.tokens
            const aliasCount = tokens !== null && typeof tokens === 'object'
              ? Object.keys(tokens).filter((name) => name.startsWith('--dsw-alias-')).length
              : 0
            if (aliasCount >= 100) stockLight = tokens
          } catch {
            /* no stock light palette: the light tile is simply not registered */
          }
          const disposers = []
          for (const spec of THEME_SPECS) {
            if (spec.scheme === 'light' && stockLight === undefined) continue
            try {
              const dispose = theme.register({
                id: spec.id,
                colorScheme: spec.scheme,
                tokens: buildThemeTokens(spec, stockLight),
              })
              disposers.push(typeof dispose === 'function' ? dispose : () => {})
            } catch (error) {
              console.warn(`[dsh-acid-core] theme "${spec.id}" rejected`, error)
            }
          }
          // Re-apply the remembered choice AFTER registering (setTheme rejects an
          // unregistered id): the host resets the preference to a built-in theme
          // whenever the registration is disposed (HMR, reload, restart).
          const remembered = rememberedTheme()
          if (remembered !== null) {
            try {
              theme.setTheme(remembered)
            } catch {
              /* registration not live yet */
            }
          }
          // Refresh the local snapshot now that the themes exist: the settings
          // page renders its tiles from it, and registration changes the list.
          try {
            push(theme.getTheme?.())
          } catch {
            /* snapshot unavailable */
          }
          let lastPreference = theme.getTheme?.()?.preference
          if (lastPreference === undefined && remembered !== null) lastPreference = remembered
          const off = themeCtx.on('theme/change', () => {
            // A retiring controller can finish a settings write late. Read the
            // current injected service instead of repainting its event payload.
            const snapshot = theme.getTheme()
            push(snapshot)
            // Forget the remembered palette only on a real transition away from
            // one of ours (the host's own Appearance row). A startup echo of the
            // stored preference must not erase it before it is re-applied.
            const preference = snapshot?.preference
            if (preference === undefined) return
            if (CUSTOM_THEME_IDS.has(lastPreference) && !CUSTOM_THEME_IDS.has(preference)) forgetAcid()
            lastPreference = preference
          })
          return () => {
            try {
              off?.()
              if (themeApi === theme) {
                themeApi = undefined
                document.body.removeAttribute('data-acid-theme')
                document.body.removeAttribute('data-acid-theme-id')
              }
            } catch {
              /* already disposed */
            }
            for (const dispose of disposers) dispose()
          }
        }, 'acid-core: themes')
      })

      // 4. Backdrop in the overlay layer (click-through), the status chip and
      //    the two brand marks in their slots, the controls in Settings.
      ctx.inject(['slots'], (slotsCtx) => {
        const slots = slotsCtx.slots
        const register = (owner, options, component, label) => {
          slots.inject(owner, () => {
            try {
              return slots.register({ name: owner, locale: NS, ...options }, component)
            } catch (error) {
              console.warn(`[dsh-acid-core] ${label} rejected`, error)
              return () => {}
            }
          })
        }

        register('shell.overlay', { id: 'acid-backdrop', order: -10 }, AcidBackdrop, 'backdrop')
        register('shell.bottom', { id: 'acid-status', order: 10 }, AcidStatus, 'status strip')
        register('conversation.header.leading', { id: 'acid-chip', order: 40 }, AcidChip, 'chip')
        register('settings.section', {
          id: 'acid-core',
          order: 34,
          label: () => {
            const title = 'meta.title'
            try {
              return typeof bindT === 'function' ? bindT(title) : fallbackT(title)
            } catch {
              return 'Acid Core'
            }
          },
        }, AcidSettings, 'settings section')
      })
    }

    return {
      name: PKG,
      inject: [],
      apply,
      // Headless seams for validate.mjs: no React, no WebGL, no DOM.
      __test: {
        buildCrystal, perspectiveMatrix, hexToRgb, PARAM_SPEC, clamp, reduceMotion,
        getParams, setParam, toggleFlag, resetParams, subscribe, subscribeTheme,
        getThemeSnapshot, publishTheme, selectTheme, ACID_TOKENS, THEME_PATCH, THEME_BASE,
        THEME_SPECS, CUSTOM_THEME_IDS, LIGHT_PATCH, buildThemeTokens, accentPatch, rememberedTheme,
        createBackdrop, createMediaLayer, normalizeParam, MEDIA_SPEC, MEDIA_DEFAULTS,
        refreshLibrary, openWallpaperDirectory, chooseImage, getLibrary, getScene, MediaSettings, CSS,
        createIntroPlayer, replayIntro, refreshVideos, openVideoDirectory, getIntro, IntroSettings,
      },
    }
  },
})
