/**
 * dsh-acid-core — Acid Graphics layer for the DeepSeek Harness Web shell.
 *
 * Three modules, one bundle, one owner:
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

    const DICTS = {
      zh: {
        'meta.title': 'Acid Core',
        'meta.description': '酸性科技风：3D 线框晶体背景 + Acid-Mono 主题。主题与控制项都在设置里，不占用界面。',
        nav: 'Acid Core',
        'sec.theme': '主题',
        'sec.themeHint': '选中一个主题即全局生效；随时可以选回「深色」或「浅色」，不会留下半套配色。',
        'theme.light': '浅色',
        'theme.dark': '深色',
        'theme.acid': '酸性暗色',
        'theme.system': '跟随系统',
        'theme.current': '当前',
        'sec.crystal': '晶体背景',
        'sec.crystalHint': '只影响背景层：鼠标、滚动与滑块都只写 uniform，不重建几何，60 帧预算。',
        'ctl.distortion': '畸变率',
        'ctl.frequency': '形变频率',
        'ctl.speed': '噪波流速',
        'ctl.backdrop': '启用背景',
        'ctl.reset': '复位',
        'state.fps': 'FPS',
        'chip.active': 'ACID // 运行中',
        'chip.idle': 'ACID // 静默',
        'hint.accent': '强调色落在可交互控件上：发送键、图标、激活态、聚焦环；正文与代码区保持低刺激。',
        'hint.budget': '排版与长文本区域不使用荧光色，酸性只做"信号"。',
      },
      en: {
        'meta.title': 'Acid Core',
        'meta.description': 'Acid graphics: a wireframe crystal backdrop plus the Acid-Mono theme. Everything lives in Settings; nothing floats over the shell.',
        nav: 'Acid Core',
        'sec.theme': 'Theme',
        'sec.themeHint': 'Picking a tile applies globally. Pick Dark or Light again at any time — no half-themed leftovers.',
        'theme.light': 'Light',
        'theme.dark': 'Dark',
        'theme.acid': 'Acid Mono',
        'theme.system': 'System',
        'theme.current': 'active',
        'sec.crystal': 'Crystal backdrop',
        'sec.crystalHint': 'Backdrop only: pointer, scroll and sliders write uniforms, never geometry, inside a 60 fps budget.',
        'ctl.distortion': 'distortion',
        'ctl.frequency': 'frequency',
        'ctl.speed': 'time speed',
        'ctl.backdrop': 'backdrop',
        'ctl.reset': 'reset',
        'state.fps': 'FPS',
        'chip.active': 'ACID // live',
        'chip.idle': 'ACID // idle',
        'hint.accent': 'Accent lands on interactive controls — send, icons, active state, focus rings; reading surfaces stay calm.',
        'hint.budget': 'No neon in type or long text: acid is a signal, not a surface.',
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

    // ── shared parameter store ─────────────────────────────────────────────
    const PARAM_SPEC = {
      distortion: { min: 0, max: 1.5, step: 0.01, value: 0.45 },
      frequency: { min: 0.2, max: 5, step: 0.01, value: 1.8 },
      speed: { min: 0.1, max: 3, step: 0.01, value: 1 },
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
      ...Object.fromEntries(Object.entries(PARAM_SPEC).map(([key, spec]) => [key, spec.value])),
    }
    for (const [key, spec] of Object.entries(PARAM_SPEC)) {
      if (typeof stored[key] === 'number' && Number.isFinite(stored[key])) params[key] = clamp(stored[key], spec.min, spec.max)
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
        const out = { backdrop: params.backdrop }
        for (const key of Object.keys(PARAM_SPEC)) out[key] = params[key]
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(out))
      } catch {
        /* storage disabled: parameters live for this page only */
      }
    }

    function setParam(key, value) {
      const spec = PARAM_SPEC[key]
      const next = spec === undefined ? value : clamp(value, spec.min, spec.max)
      if (params[key] === next) return
      params = { ...params, [key]: next }
      persist()
      emit()
    }

    function toggleFlag(key) {
      params = { ...params, [key]: !params[key] }
      persist()
      emit()
    }

    function resetParams() {
      const next = { backdrop: true }
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
        // re-apply on load. Any other id clears the memory.
        try {
          if (id === THEME_ID) window.localStorage?.setItem(THEME_FLAG, 'on')
          else window.localStorage?.removeItem(THEME_FLAG)
        } catch {
          /* storage disabled */
        }
        themeApi?.setTheme(id)
      } catch (error) {
        console.warn('[dsh-acid-core] theme switch rejected', error)
      }
    }

    /** Has the user asked for the acid theme and not switched away since? */
    function acidRemembered() {
      try {
        return window.localStorage?.getItem(THEME_FLAG) === 'on'
      } catch {
        return false
      }
    }

    function forgetAcid() {
      try {
        window.localStorage?.removeItem(THEME_FLAG)
      } catch {
        /* storage disabled */
      }
    }

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
    function createBackdrop(canvas, crystal) {
      const options = { alpha: true, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power' }
      const gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options)
      if (gl === null || gl === undefined) return undefined

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

      const COLOR_LIME = hexToRgb('#CCFF00')
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

      const onResize = () => resize()
      const onVisibility = () => {
        if (document.hidden) {
          active = false
          cancelAnimationFrame(raf)
          raf = 0
        } else if (active && raf === 0) {
          resize()
          last = 0
          raf = requestAnimationFrame(frame)
        }
      }

      resize()
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('scroll', onScroll, { passive: true, capture: true })
      window.addEventListener('resize', onResize)
      document.addEventListener('visibilitychange', onVisibility)

      if (reduceMotion) {
        clock = 1.4
        draw()
        fps = 0
      } else {
        raf = requestAnimationFrame(frame)
      }

      return {
        dispose() {
          active = false
          if (raf !== 0) cancelAnimationFrame(raf)
          raf = 0
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('scroll', onScroll, true)
          window.removeEventListener('resize', onResize)
          document.removeEventListener('visibilitychange', onVisibility)
          gl.deleteBuffer(positionBuffer)
          gl.deleteBuffer(lineBuffer)
          gl.deleteProgram(program)
          gl.getExtension('WEBGL_lose_context')?.loseContext()
        },
      }
    }

    // ── components ─────────────────────────────────────────────────────────

    /** Module A: a fixed, click-through canvas with the reading-column guard. */
    function AcidBackdrop() {
      const enabled = useSyncExternalStore(subscribe, () => getParams().backdrop)
      const canvasRef = useRef(null)
      const crystal = React.useMemo(() => buildCrystal(20, 1), [])

      useEffect(() => {
        if (!enabled) return undefined
        const canvas = canvasRef.current
        if (canvas === null) return undefined
        let handle
        try {
          handle = createBackdrop(canvas, crystal)
        } catch (error) {
          console.warn('[dsh-acid-core] canvas init failed', error)
          return undefined
        }
        return () => handle?.dispose()
      }, [enabled, crystal])

      if (!enabled) return null
      return h('div', { className: 'dsh-acid-field', 'data-plugin': PKG, 'aria-hidden': true },
        h('canvas', { ref: canvasRef, className: 'dsh-acid-canvas' }))
    }

    /** One row of the sandbox: label, range input, live value. */
    function ControlRow(props) {
      const { id, label, value, min, max, step, onChange } = props
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
        h('span', { className: 'dsh-acid-val' }, Number(value).toFixed(2)))
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
      if (id === THEME_ID) return t('theme.acid')
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
            h(Toggle, { label: t('ctl.backdrop'), on: current.backdrop, onToggle: () => toggleFlag('backdrop') }),
            h('button', { type: 'button', className: 'dsh-acid-mini', onClick: resetParams }, t('ctl.reset'))),
          h('p', { className: 'dsh-acid-help' }, t('sec.crystalHint')),
          h('p', { className: 'dsh-acid-help' }, t('hint.accent'))))
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
  --acid-cyan:#00F0FF;
  --acid-rule:#1E2330;
}

/* ── A. backdrop ─────────────────────────────────────────────────────── */
.dsh-acid-field{
  position:fixed; inset:0; z-index:0; pointer-events:none;
  opacity:0; animation:dsh-acid-in 900ms ease-out 60ms forwards;
}
.dsh-acid-canvas{display:block;width:100%;height:100%}
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
  filter: brightness(0) saturate(100%) invert(89%) sepia(98%) saturate(1600%) hue-rotate(16deg) brightness(1.04);
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

      // 3. The Acid-Mono theme. Registering a complete theme is what keeps the
      //    shell from showing stock colours on controls nobody remembered; the
      //    user picks it from the tiles and can leave it in one click.
      ctx.inject(['theme'], (themeCtx) => {
        const theme = themeCtx.theme
        if (theme === undefined || typeof theme.register !== 'function') return
        themeApi = theme
        ctx.effect(() => {
          // Mirror "this theme is active" onto the body so the affordance layer
          // (lime icons/buttons) only exists while the acid theme is selected,
          // and disappears the moment the user picks another one.
          const push = (snapshot) => {
            publishTheme(snapshot)
            try {
              const active = snapshot?.active?.id === THEME_ID
              if (active) document.body.setAttribute('data-acid-theme', 'on')
              else document.body.removeAttribute('data-acid-theme')
            } catch {
              /* no body yet */
            }
          }
          try {
            push(theme.getTheme?.())
          } catch {
            /* snapshot unavailable: tiles render from the next theme/change */
          }
          let dispose = () => {}
          try {
            dispose = theme.register({ id: THEME_ID, colorScheme: 'dark', tokens: ACID_TOKENS }) ?? (() => {})
          } catch (error) {
            console.warn('[dsh-acid-core] theme registration rejected', error)
          }
          // Re-apply the remembered choice AFTER registering (setTheme rejects an
          // unregistered id): the host resets the preference to a built-in theme
          // whenever the registration is disposed (HMR, reload, restart), which
          // would otherwise silently drop the acid look.
          if (acidRemembered()) {
            try {
              theme.setTheme(THEME_ID)
            } catch {
              /* registration not live yet */
            }
          }
          // Refresh the local snapshot now that the theme exists: the settings
          // page renders its tiles from it, and the registration itself changes
          // the theme list.
          try {
            push(theme.getTheme?.())
          } catch {
            /* snapshot unavailable */
          }
          let lastPreference = theme.getTheme?.()?.preference
          if (lastPreference === undefined && acidRemembered()) lastPreference = THEME_ID
          const off = ctx.on('theme/change', (snapshot) => {
            push(snapshot)
            // Forget the remembered choice only on a real transition away from
            // the acid theme (the host's own Appearance row). A startup echo of
            // the stored preference must not erase it before it is re-applied.
            const preference = snapshot?.preference
            if (preference === undefined) return
            if (lastPreference === THEME_ID && preference !== THEME_ID) forgetAcid()
            lastPreference = preference
          })
          return () => {
            try {
              off?.()
              document.body.removeAttribute('data-acid-theme')
            } catch {
              /* already disposed */
            }
            dispose()
          }
        }, 'acid-core: theme')
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
      },
    }
  },
})
