/**
 * dsh-composer-meter — browser half.
 *
 * One stat pill in the composer dock, styled like the host's own `activity` /
 * `usage` pills: the draft's character count, a rough token estimate, and an
 * estimated cost for the session. Clicking the pill opens a small panel with
 * the breakdown and the pricing controls.
 *
 * Pricing ships with the official DeepSeek table (Flash / Pro, peak vs idle),
 * so the cost is visible without any configuration; the panel lets the user
 * switch preset or enter custom prices when their bill differs.
 *
 * Wiring
 *   - slot: `conversation.composer.dock` (list, session scope). It is the row
 *     the host already allocates under the composer card, next to its own
 *     context meter.
 *   - data: the standard session kit seats `useInput` (live draft) and
 *     `useProjection` (the host's `tokenUsage` projection) on every composer
 *     child slot; never the DOM.
 *
 * Failure policy: the Web shell treats a client entry that never activates as
 * a boot failure, so `inject` stays empty and every optional service is taken
 * through `ctx.inject`. A registration that throws is swallowed and logged;
 * the composer keeps working without the meter. Missing seats degrade to "no
 * numbers" rather than a crashed slot.
 */

window.__ModuleLoader__.load({
  id: 'dsh-composer-meter',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace of the browser half; also the registration locale. */
    const NS = 'composerMeter'

    /** Where the pricing choice is remembered. */
    const STORAGE_PRICING = 'dsh.composer-meter.pricing'
    /** Draft snapshots: one key per session, capped by count and characters. */
    const STORAGE_VAULT = 'dsh.composer-meter.vault'
    const VAULT_LIMIT = 20
    const VAULT_BUDGET = 200000
    /** A snapshot is taken on the leading edge: first text, then every 2s. */
    const SNAPSHOT_INTERVAL_MS = 2000
    const SNAPSHOT_MIN_CHARS = 12

    /** Panel anchored above the pill. */
    const PANEL_GAP = 8
    const PANEL_WIDTH = 300
    const PANEL_MARGIN = 8

    /**
     * Official DeepSeek list prices, yuan per million tokens, as published on
     * api-docs.deepseek.com (checked 2026-10). `[idle, peak]`: Beijing-time
     * weekdays 09:00–12:00 and 14:00–18:00 are peak, everything else (including
     * weekends and public holidays) is idle at half the peak price. DeepSeek
     * does not bill cache writes separately, hence `cacheWrite: [0, 0]`.
     */
    const PRICE_PRESETS = {
      flash: {
        input: [1, 2],
        cacheRead: [0.02, 0.04],
        cacheWrite: [0, 0],
        output: [4, 8],
      },
      pro: {
        input: [4.5, 9],
        cacheRead: [0.15, 0.3],
        cacheWrite: [0, 0],
        output: [13.5, 27],
      },
    }

    /** Price table entries: our key, the usage bucket, and the locale label. */
    const PRICE_FIELDS = [
      { key: 'input', bucket: 'uncachedInputTokens', label: 'panel.price.input' },
      { key: 'cacheRead', bucket: 'cacheReadTokens', label: 'panel.price.cacheRead' },
      { key: 'cacheWrite', bucket: 'cacheWriteTokens', label: 'panel.price.cacheWrite' },
      { key: 'output', bucket: 'outputTokens', label: 'panel.price.output' },
    ]

    /** Pricing modes offered in the panel. */
    const MODES = ['flash', 'pro', 'custom']

    /** Copy used when no locale service is mounted, so keys never render raw. */
    const DICTS = {
      zh: {
        'meta.title': '输入计量',
        'meta.description': '在输入框下方显示草稿字数、预估 token，以及按 DeepSeek 官方价目估算的本会话费用。',
        chars: '字',
        tokens: 'tokens',
        estimate: '≈',
        hint: '估算值，实际以模型分词器与账单为准。',
        'panel.aria': '草稿、用量与计价',
        'panel.draft': '草稿',
        'panel.lines': '行',
        'panel.cjk': 'CJK 字符',
        'panel.latin': '拉丁字符',
        'panel.space': '空白',
        'panel.tokens': '预估 tokens',
        'panel.session': '本会话',
        'panel.uncached': '未缓存输入',
        'panel.cacheRead': '缓存读',
        'panel.cacheWrite': '缓存写',
        'panel.output': '输出',
        'panel.cost': '累计',
        'panel.pricing': '计价',
        'panel.mode.flash': 'Flash',
        'panel.mode.pro': 'Pro',
        'panel.mode.custom': '自定义',
        'panel.peak': '高峰时段',
        'panel.idle': '空闲时段',
        'panel.unit': '元 / 百万 token',
        'panel.priceHint': '自定义价格留空表示该项不计费。',
        'panel.priceNote': '默认按 DeepSeek 官方公开价估算（Flash，高峰/空闲自动切换）。跨时段或换过模型时，整段按当前时段与所选档位计；价格有变请切 Pro 或自定义。',
        'panel.estimateHint': 'token 为估算，实际以模型分词器为准。',
        'clean.button': '清洗草稿',
        'clean.pending': '可清洗 {n} 处（零宽字符 / 全角空格 / 行尾空白 / 连续空行）',
        'clean.done': '已清洗 {n} 处',
        'clean.undo': '还原',
        'clean.unavailable': '当前宿主不支持改写草稿',
        'vault.title': '草稿保险箱',
        'vault.empty': '还没有快照（停止输入约 2 秒后会存一份）',
        'vault.restore': '恢复这一版',
        'vault.clear': '清空快照',
        'vault.unavailable': '当前宿主不支持恢复',
      },
      en: {
        'meta.title': 'Composer Meter',
        'meta.description': 'Live character count, a rough token estimate, and the session\u2019s estimated cost from DeepSeek\u2019s published prices.',
        chars: 'chars',
        tokens: 'tokens',
        estimate: '≈',
        hint: 'Rough estimate; the tokenizer and your bill decide.',
        'panel.aria': 'Draft, usage and pricing',
        'panel.draft': 'Draft',
        'panel.lines': 'lines',
        'panel.cjk': 'CJK chars',
        'panel.latin': 'Latin chars',
        'panel.space': 'spaces',
        'panel.tokens': 'estimated tokens',
        'panel.session': 'This session',
        'panel.uncached': 'uncached input',
        'panel.cacheRead': 'cache read',
        'panel.cacheWrite': 'cache write',
        'panel.output': 'output',
        'panel.cost': 'total',
        'panel.pricing': 'Pricing',
        'panel.mode.flash': 'Flash',
        'panel.mode.pro': 'Pro',
        'panel.mode.custom': 'Custom',
        'panel.peak': 'peak hours',
        'panel.idle': 'idle hours',
        'panel.unit': 'yuan / 1M tokens',
        'panel.priceHint': 'A blank custom price means that bucket is not billed.',
        'panel.priceNote': 'Estimated with DeepSeek\u2019s published list prices (Flash, peak/idle switched automatically). A session that spans periods or models is priced as one at the current period and preset; switch to Pro or Custom when your bill differs.',
        'panel.estimateHint': 'Token counts are estimates; the model tokenizer decides.',
        'clean.button': 'Clean draft',
        'clean.pending': '{n} cleanable spots (zero-width chars / ideographic spaces / trailing blanks / blank-line runs)',
        'clean.done': 'Cleaned {n} spots',
        'clean.undo': 'Undo',
        'clean.unavailable': 'This host does not allow rewriting the draft',
        'vault.title': 'Draft vault',
        'vault.empty': 'No snapshots yet (one is taken about 2s after you stop typing)',
        'vault.restore': 'Restore this version',
        'vault.clear': 'Clear snapshots',
        'vault.unavailable': 'This host does not allow restoring a draft',
      },
    }

    /**
     * Characters that a byte-pair tokenizer normally spends one token on:
     * CJK ideographs and kana, Hangul, and the full-width / CJK punctuation
     * ranges. Everything else is charged at ~3.5 characters per token, which is
     * a reasonable average for Latin text and code.
     */
    const DENSE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f\u3040-\u30ff\uac00-\ud7af]/

    /**
     * Rough token count for a draft.
     * @param text - the draft as the composer holds it.
     * @returns an integer token estimate, 0 for whitespace-only text.
     */
    function estimateTokens(text) {
      if (typeof text !== 'string' || text === '') return 0
      let dense = 0
      let loose = 0
      for (const ch of text) {
        if (/\s/.test(ch)) continue
        if (DENSE.test(ch)) dense += 1
        else loose += 1
      }
      return dense + Math.ceil(loose / 3.5)
    }

    /**
     * Compact digits so the line keeps its width on long drafts.
     * @param n - a non-negative integer.
     * @returns e.g. `842`, `1.2k`, `18k`.
     */
    function compact(n) {
      if (n < 1000) return String(n)
      if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
      return `${Math.round(n / 1000)}k`
    }

    /**
     * Money with enough decimals for the useful range: a few thousandths of a
     * yuan still has to be visible, but the pill must not grow for large totals.
     * @param value - non-negative amount in yuan.
     * @returns a fixed-point string without a currency symbol.
     */
    function formatMoney(value) {
      const n = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
      if (n === 0) return '0'
      if (n < 0.01) return n.toFixed(4)
      if (n < 1) return n.toFixed(3)
      return n.toFixed(2)
    }

    /**
     * Is `at` inside DeepSeek's peak window? Beijing time, Monday–Friday,
     * 09:00–12:00 and 14:00–18:00. Public holidays are not modelled.
     * @param at - a Date.
     * @returns true for peak, false for idle.
     */
    function isPeakHour(at) {
      const date = at instanceof Date ? at : new Date()
      if (Number.isNaN(date.getTime())) return false
      const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
      const day = beijing.getUTCDay()
      if (day === 0 || day === 6) return false
      const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes()
      return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60)
    }

    /**
     * Normalize a remembered pricing choice. Accepts the current shape
     * (`{ mode, custom }`) and the earlier flat number table as `custom`.
     * @param parsed - whatever `localStorage` held.
     * @returns `{ mode, custom }` with a valid mode.
     */
    function normalizePricing(parsed) {
      if (parsed === null || typeof parsed !== 'object') return { mode: 'flash', custom: {} }
      if (typeof parsed.mode === 'string' && MODES.includes(parsed.mode)) {
        return { mode: parsed.mode, custom: normalizeCustom(parsed.custom) }
      }
      const custom = normalizeCustom(parsed)
      return Object.keys(custom).length === 0 ? { mode: 'flash', custom: {} } : { mode: 'custom', custom }
    }

    /** Keep only finite non-negative numbers from a custom price object. */
    function normalizeCustom(value) {
      const out = {}
      if (value === null || typeof value !== 'object') return out
      for (const field of PRICE_FIELDS) {
        const price = value[field.key]
        if (typeof price === 'number' && Number.isFinite(price) && price >= 0) out[field.key] = price
      }
      return out
    }

    /**
     * Resolve the effective unit prices for one moment.
     * @param pricing - `{ mode, custom }`.
     * @param at - the Date whose peak/idle window applies.
     * @returns `{ mode, peak, prices }` where prices are yuan per 1M tokens.
     */
    function resolvePricing(pricing, at) {
      const normalized = normalizePricing(pricing)
      const mode = normalized.mode
      if (mode === 'custom') return { mode, peak: false, prices: normalized.custom }
      const preset = PRICE_PRESETS[mode === 'pro' ? 'pro' : 'flash']
      const peak = isPeakHour(at)
      const prices = {}
      for (const field of PRICE_FIELDS) prices[field.key] = preset[field.key][peak ? 1 : 0]
      return { mode, peak, prices }
    }

    /**
     * Estimated cost of the session so far, from the host's token-usage
     * projection and a resolved price table.
     * @param usage - `tokenUsage` projection value, or undefined.
     * @param prices - `{ input, cacheRead, cacheWrite, output }` in ¥/1M tokens.
     * @returns the amount in yuan, or null when nothing can be priced.
     */
    function computeCost(usage, prices) {
      if (usage === null || typeof usage !== 'object' || prices === null || typeof prices !== 'object') return null
      let amount = 0
      let priced = false
      for (const field of PRICE_FIELDS) {
        const price = prices[field.key]
        if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) continue
        priced = true
        const count = usage[field.bucket]
        if (typeof count === 'number' && Number.isFinite(count)) amount += (count * price) / 1e6
      }
      return priced ? amount : null
    }

    /** Read the remembered pricing choice; `{}` when storage is unavailable. */
    function readPricing() {
      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_PRICING)
        if (typeof raw !== 'string' || raw === '') return { mode: 'flash', custom: {} }
        return normalizePricing(JSON.parse(raw))
      } catch {
        return { mode: 'flash', custom: {} }
      }
    }

    /** Write the pricing choice; a storage failure only loses persistence. */
    function writePricing(pricing) {
      try {
        const normalized = normalizePricing(pricing)
        globalThis.localStorage?.setItem(STORAGE_PRICING, JSON.stringify(normalized))
      } catch {
        /* storage disabled: the choice lives for this page only */
      }
    }

    /** Count the draft's lines (an empty draft never reaches here). */
    function countLines(text) {
      return text.split('\n').length
    }

    /**
     * Conservative draft cleanup: invisible characters, non-breaking/ideographic
     * spaces, trailing whitespace and runs of blank lines. Fenced code blocks
     * are left byte-for-byte alone, and punctuation is never rewritten (full
     * width punctuation is correct in Chinese prose).
     * @param text - the draft.
     * @returns `{ text, changes }`, where changes counts touched lines/groups.
     */
    function cleanDraft(text) {
      if (typeof text !== 'string' || text === '') return { text: typeof text === 'string' ? text : '', changes: 0 }
      let changes = 0
      const lines = text.split('\n')
      let inFence = false
      const out = []
      for (const line of lines) {
        if (/^\s*(?:```|~~~)/.test(line)) {
          inFence = !inFence
          out.push(line)
          continue
        }
        if (inFence) {
          out.push(line)
          continue
        }
        const before = line
        const next = line
          .replace(/[\u200b-\u200d\ufeff]/g, '')
          .replace(/[\u00a0\u3000]/g, ' ')
          .replace(/[ \t]+$/g, '')
        if (next !== before) changes += 1
        out.push(next)
      }
      // Collapse blank-line runs outside fences only.
      const joined = out.join('\n')
      const parts = joined.split(/((?:```|~~~)[\s\S]*?(?:```|~~~))/g)
      const text2 = parts
        .map((part, index) => {
          if (index % 2 === 1) return part
          const next = part.replace(/\n{3,}/g, '\n\n')
          if (next !== part) changes += 1
          return next
        })
        .join('')
      return { text: text2, changes }
    }

    /** Storage key of one session's draft vault. */
    function vaultKey(sessionId) {
      return sessionId === undefined || sessionId === null ? STORAGE_VAULT : `${STORAGE_VAULT}.${sessionId}`
    }

    /**
     * Keep a vault within its count and character budgets, newest first when the
     * budget runs out.
     * @param entries - candidate snapshots.
     * @returns the trimmed array, oldest first.
     */
    function trimVault(entries) {
      const valid = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.text === 'string' && entry.text !== '')
        .slice(-VAULT_LIMIT)
      let total = 0
      const kept = []
      for (let index = valid.length - 1; index >= 0; index -= 1) {
        const entry = valid[index]
        if (total + entry.text.length > VAULT_BUDGET) break
        total += entry.text.length
        kept.unshift(entry)
      }
      return kept
    }

    /**
     * Append one snapshot if it adds information.
     * @param entries - existing snapshots.
     * @param text - the draft text to keep.
     * @param at - epoch milliseconds.
     * @returns the new trimmed array.
     */
    function appendSnapshot(entries, text, at) {
      if (typeof text !== 'string' || text.length < SNAPSHOT_MIN_CHARS || text.trim() === '') return trimVault(entries)
      const existing = trimVault(entries)
      const last = existing[existing.length - 1]
      if (last !== undefined && last.text === text) return existing
      return trimVault([...existing, { at, text, chars: text.length }])
    }

    /** Read one session's snapshots; `[]` when storage is unavailable. */
    function readVault(sessionId) {
      try {
        const raw = globalThis.localStorage?.getItem(vaultKey(sessionId))
        if (typeof raw !== 'string' || raw === '') return []
        return trimVault(JSON.parse(raw))
      } catch {
        return []
      }
    }

    /** Write one session's snapshots; a storage failure only loses history. */
    function writeVault(sessionId, entries) {
      try {
        const trimmed = trimVault(entries)
        if (trimmed.length === 0) globalThis.localStorage?.removeItem(vaultKey(sessionId))
        else globalThis.localStorage?.setItem(vaultKey(sessionId), JSON.stringify(trimmed))
      } catch {
        /* storage disabled: the vault lives for this page only */
      }
    }

    /** `HH:mm` for a snapshot timestamp. */
    function formatClock(at) {
      const date = new Date(typeof at === 'number' && Number.isFinite(at) ? at : Date.now())
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    /** First non-empty line of a snapshot, clipped for the list. */
    function vaultPreview(entry) {
      const line = String(entry?.text ?? '').split('\n').find((candidate) => candidate.trim() !== '') ?? ''
      return line.length > 42 ? `${line.slice(0, 42)}…` : line
    }

    /** Split the draft into CJK / other non-space / whitespace counts. */
    function classifyDraft(text) {
      let cjk = 0
      let latin = 0
      let spaces = 0
      for (const ch of text) {
        if (/\s/.test(ch)) spaces += 1
        else if (DENSE.test(ch)) cjk += 1
        else latin += 1
      }
      return { cjk, latin, spaces }
    }

    /**
     * Dictionary for the document language. Only the no-locale-service path
     * reaches this: with a locale service the host hands `t` over already bound
     * to the active language.
     */
    function fallbackDict() {
      const lang = (typeof document !== 'undefined' && document.documentElement?.lang)
        || (typeof navigator !== 'undefined' && navigator.language)
        || 'zh'
      return /^zh/i.test(String(lang)) ? DICTS.zh : DICTS.en
    }

    /** Fallback translator for profiles without the locale service. */
    function fallbackT(key, vars) {
      const dict = fallbackDict()
      const value = dict[key] ?? DICTS.zh[key] ?? key
      return vars === undefined ? value : value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
    }

    /** The small pencil mark the host pills all carry. */
    function MeterIcon() {
      return h('svg', {
        className: 'dsh-cm-icon',
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
      h('path', { d: 'M11.2 2.4l2.4 2.4-8.1 8.1-3.1.7.7-3.1 8.1-8.1z' }),
      h('path', { d: 'M9.6 4l2.4 2.4' }))
    }

    /** One definition-list row in the panel. */
    function Row(props) {
      return h('div', { className: 'dsh-cm-row' },
        h('dt', null, props.label),
        h('dd', null, props.value))
    }

    /** The meter itself: a stat pill, rendered only when the draft is non-empty. */
    function Meter(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const useInput = props.useInput
      const useProjection = props.useProjection
      const [open, setOpen] = React.useState(false)
      const [pos, setPos] = React.useState(null)
      const [pricing, setPricing] = React.useState(readPricing)
      const [vault, setVault] = React.useState([])
      const [cleanInfo, setCleanInfo] = React.useState(null)
      const triggerRef = React.useRef(null)
      const panelRef = React.useRef(null)
      /** Session of this composer slot (injected); undefined disables the vault. */
      const sessionId = props.sessionId
      /** The draft the composer currently holds, for the unmount snapshot. */
      const draftRef = React.useRef('')
      const lastDraftRef = React.useRef('')
      const lastSnapshotAt = React.useRef(0)

      // A one-field selector: the input snapshot is a large object, and
      // subscribing to the whole thing would re-render this line on every
      // attachment or phase change too.
      const draft = typeof useInput === 'function'
        ? useInput((state) => {
            const value = state !== null && typeof state === 'object' ? state.draft : undefined
            return typeof value === 'string' ? value : ''
          })
        : ''

      // The host's own usage pill reads the same projection, so the seat is
      // known to be on this slot; without it the cost part simply disappears.
      let usage
      try {
        usage = typeof useProjection === 'function' ? useProjection('tokenUsage') : undefined
      } catch {
        usage = undefined
      }

      // Rolling draft snapshots: leading edge on the first text, then at most
      // one every couple of seconds, plus one when the draft empties (send or
      // clear) and one on session switch. No timers: the composer keeps its
      // "no setTimeout / setInterval" contract.
      React.useEffect(() => {
        draftRef.current = draft
        const previous = lastDraftRef.current
        lastDraftRef.current = draft
        if (sessionId === undefined || sessionId === null || draft === previous) return
        if (draft === '') {
          if (previous !== '') writeVault(sessionId, appendSnapshot(readVault(sessionId), previous, Date.now()))
          lastSnapshotAt.current = 0
          return
        }
        const now = Date.now()
        if (previous === '' || now - lastSnapshotAt.current >= SNAPSHOT_INTERVAL_MS) {
          writeVault(sessionId, appendSnapshot(readVault(sessionId), draft, now))
          lastSnapshotAt.current = now
        }
      }, [draft, sessionId])

      // Session switch or unmount: keep the last paragraph too.
      React.useEffect(() => () => {
        const final = draftRef.current
        if (sessionId === undefined || sessionId === null || final === '') return
        writeVault(sessionId, appendSnapshot(readVault(sessionId), final, Date.now()))
      }, [sessionId])

      // Load this session's snapshots when the panel opens.
      React.useEffect(() => {
        if (!open || sessionId === undefined || sessionId === null) return
        setVault(readVault(sessionId))
      }, [open, sessionId])

      // Place the panel above the pill once it opens: bottom-anchored, so an
      // unknown panel height never pushes it off-screen.
      React.useEffect(() => {
        if (!open) {
          setPos(null)
          return undefined
        }
        const place = () => {
          const trigger = triggerRef.current
          if (trigger === null || typeof window === 'undefined') return
          const rect = trigger.getBoundingClientRect()
          const maxLeft = (window.innerWidth || PANEL_WIDTH + PANEL_MARGIN * 2) - PANEL_WIDTH - PANEL_MARGIN
          const left = Math.min(Math.max(PANEL_MARGIN, rect.left + rect.width / 2 - PANEL_WIDTH / 2), Math.max(PANEL_MARGIN, maxLeft))
          setPos({ left, bottom: (window.innerHeight || 0) - rect.top + PANEL_GAP })
        }
        place()
        const onDown = (event) => {
          const target = event.target
          const inside = (panelRef.current?.contains(target) === true) || (triggerRef.current?.contains(target) === true)
          if (!inside) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onDown, true)
        document.addEventListener('keydown', onKey, true)
        window.addEventListener('resize', place)
        return () => {
          document.removeEventListener('pointerdown', onDown, true)
          document.removeEventListener('keydown', onKey, true)
          window.removeEventListener('resize', place)
        }
      }, [open])

      const hasDraft = draft !== ''
      const chars = hasDraft ? [...draft].length : 0
      const tokens = hasDraft ? estimateTokens(draft) : 0
      const effective = resolvePricing(pricing, new Date())
      const cost = computeCost(usage, effective.prices)
      const costText = cost === null ? null : `¥${formatMoney(cost)}`
      // The cost is session-level, so it stays visible when the draft empties
      // (the pill becomes a plain cost reading); without either there is
      // nothing to show.
      const showCost = costText !== null && (cost > 0 || hasDraft)
      if (!hasDraft && !showCost) return null
      const aria = [
        hasDraft ? `${chars} ${t('chars')}` : null,
        hasDraft ? `${t('estimate')} ${tokens} ${t('tokens')}` : null,
        showCost ? costText : null,
      ].filter((part) => part !== null).join(' · ')

      const pillChildren = [h(MeterIcon)]
      if (hasDraft) {
        pillChildren.push(
          h('span', { className: 'dsh-cm-num' }, chars, ' ', t('chars')),
          h('span', { className: 'dsh-cm-sep', 'aria-hidden': true }, '·'),
          h('span', { className: 'dsh-cm-num' }, t('estimate'), ' ', compact(tokens), ' ', t('tokens')),
        )
      }
      if (showCost) {
        pillChildren.push(
          h('span', { className: 'dsh-cm-sep', 'aria-hidden': true }, '·'),
          h('span', { className: 'dsh-cm-cost' }, costText),
        )
      }

      const pill = h('button', {
        type: 'button',
        ref: triggerRef,
        className: 'dsh-cm',
        'data-plugin': 'dsh-composer-meter',
        'data-composer-stat': 'composer-meter',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': aria,
        title: t('hint'),
        onClick: () => setOpen((value) => !value),
      }, pillChildren)

      if (!open || pos === null) return pill

      const lines = countLines(draft)
      const parts = classifyDraft(draft)
      const usageRows = usage !== null && typeof usage === 'object'
        ? PRICE_FIELDS.map((field) => h(Row, {
            key: field.key,
            label: t(`panel.${field.key === 'input' ? 'uncached' : field.key}`),
            value: compact(Number.isFinite(usage[field.bucket]) ? usage[field.bucket] : 0),
          }))
        : null

      const setMode = (mode) => {
        const next = { mode, custom: normalizeCustom(pricing.custom) }
        setPricing(next)
        writePricing(next)
      }

      const setCustom = (key, raw) => {
        const custom = { ...normalizeCustom(pricing.custom) }
        if (raw === '') delete custom[key]
        else {
          const value = Number(raw)
          if (Number.isFinite(value) && value >= 0) custom[key] = value
        }
        const next = { mode: 'custom', custom }
        setPricing(next)
        writePricing(next)
      }

      const custom = normalizeCustom(pricing.custom)

      const inputActions = props.inputActions
      const canRewrite = typeof inputActions?.setDraft === 'function'
      const cleaned = cleanDraft(draft)
      const applyClean = () => {
        if (!canRewrite || cleaned.changes === 0) return
        const entries = appendSnapshot(readVault(sessionId), draft, Date.now())
        writeVault(sessionId, entries)
        setVault(entries)
        setCleanInfo({ previous: draft, changes: cleaned.changes })
        inputActions.setDraft(cleaned.text)
      }
      const undoClean = () => {
        if (!canRewrite || cleanInfo === null) return
        inputActions.setDraft(cleanInfo.previous)
        setCleanInfo(null)
      }
      const restore = (entry) => {
        if (!canRewrite) return
        inputActions.setDraft(entry.text)
        setOpen(false)
      }
      const clearVault = () => {
        if (sessionId !== undefined && sessionId !== null) writeVault(sessionId, [])
        setVault([])
      }

      const vaultRows = vault
        .slice(-6)
        .reverse()
        .map((entry, index) => h('button', {
          key: `${entry.at}-${index}`,
          type: 'button',
          className: 'dsh-cm-vault-row',
          disabled: !canRewrite,
          title: canRewrite ? t('vault.restore') : t('vault.unavailable'),
          onClick: () => restore(entry),
        },
        h('span', { className: 'dsh-cm-vault-time' }, formatClock(entry.at)),
        h('span', { className: 'dsh-cm-vault-text' }, vaultPreview(entry)),
        h('span', { className: 'dsh-cm-vault-meta' }, String(entry.chars))))

      const panel = h('div', {
        ref: panelRef,
        className: 'dsh-cm-panel',
        role: 'dialog',
        'aria-label': t('panel.aria'),
        style: { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${PANEL_WIDTH}px` },
      },
      h('div', { className: 'dsh-cm-group' },
        h('div', { className: 'dsh-cm-title' }, t('panel.draft')),
        h('dl', { className: 'dsh-cm-list' },
          h(Row, { label: t('panel.chars'), value: compact(chars) }),
          h(Row, { label: t('panel.lines'), value: compact(lines) }),
          h(Row, { label: t('panel.cjk'), value: compact(parts.cjk) }),
          h(Row, { label: t('panel.latin'), value: compact(parts.latin) }),
          h(Row, { label: t('panel.space'), value: compact(parts.spaces) }),
          h(Row, { label: t('panel.tokens'), value: compact(tokens) })),
        h('div', { className: 'dsh-cm-actions' },
          h('button', {
            type: 'button',
            className: 'dsh-cm-small',
            disabled: cleaned.changes === 0 || !canRewrite,
            title: canRewrite ? t('clean.button') : t('clean.unavailable'),
            onClick: applyClean,
          }, t('clean.button')),
          cleanInfo === null ? null : h('button', { type: 'button', className: 'dsh-cm-small', onClick: undoClean }, t('clean.undo'))),
        cleaned.changes === 0 ? null : h('p', { className: 'dsh-cm-status' }, t('clean.pending', { n: cleaned.changes })),
        cleanInfo === null ? null : h('p', { className: 'dsh-cm-status' }, t('clean.done', { n: cleanInfo.changes }))),

      usageRows === null ? null : h('div', { className: 'dsh-cm-group' },
        h('div', { className: 'dsh-cm-title' }, t('panel.session')),
        h('dl', { className: 'dsh-cm-list' }, usageRows),
        costText === null ? null : h('div', { className: 'dsh-cm-total' },
          h('span', null, t('panel.cost')),
          h('span', { className: 'dsh-cm-cost' }, costText))),

      h('div', { className: 'dsh-cm-group' },
        h('div', { className: 'dsh-cm-title' }, t('panel.pricing')),
        h('div', { className: 'dsh-cm-modes', role: 'group' },
          MODES.map((mode) => h('button', {
            key: mode,
            type: 'button',
            className: 'dsh-cm-mode',
            'data-active': pricing.mode === mode ? 'true' : 'false',
            'aria-pressed': pricing.mode === mode ? 'true' : 'false',
            onClick: () => setMode(mode),
          }, t(`panel.mode.${mode}`)))),
        h('div', { className: 'dsh-cm-period' },
          pricing.mode === 'custom' ? null : h('span', { className: 'dsh-cm-chip', 'data-peak': effective.peak ? 'true' : 'false' },
            t(effective.peak ? 'panel.peak' : 'panel.idle')),
          h('span', { className: 'dsh-cm-unit' }, t('panel.unit'))),
        h('dl', { className: 'dsh-cm-list' },
          PRICE_FIELDS.map((field) => h(Row, {
            key: field.key,
            label: t(field.label),
            value: typeof effective.prices[field.key] === 'number'
              ? `${effective.prices[field.key]}`
              : '—',
          }))),
        pricing.mode !== 'custom' ? null : h('div', { className: 'dsh-cm-prices' },
          PRICE_FIELDS.map((field) => h('label', { key: field.key, className: 'dsh-cm-price' },
            h('span', null, t(field.label)),
            h('input', {
              type: 'number',
              inputMode: 'decimal',
              min: '0',
              step: '0.01',
              value: typeof custom[field.key] === 'number' ? String(custom[field.key]) : '',
              onChange: (event) => setCustom(field.key, event.currentTarget.value),
              onFocus: () => setMode('custom'),
            })))),
        h('p', { className: 'dsh-cm-hint' }, t('panel.priceNote')),
        pricing.mode !== 'custom' ? null : h('p', { className: 'dsh-cm-hint' }, t('panel.priceHint')),
        h('p', { className: 'dsh-cm-hint' }, t('panel.estimateHint'))),

      h('div', { className: 'dsh-cm-group' },
        h('div', { className: 'dsh-cm-title' }, t('vault.title')),
        vault.length === 0
          ? h('p', { className: 'dsh-cm-hint' }, t('vault.empty'))
          : h('div', { className: 'dsh-cm-vault' }, vaultRows),
        h('div', { className: 'dsh-cm-actions' },
          vault.length === 0 ? null : h('button', { type: 'button', className: 'dsh-cm-small', onClick: clearVault }, t('vault.clear')))))

      return h('span', { className: 'dsh-cm-anchor' }, pill, panel)
    }

    const CSS = `
.dsh-cm-anchor{display:inline-flex;align-items:center;min-width:0}
.dsh-cm{display:inline-flex;align-items:center;gap:4px;
  height:calc(28px + var(--dsh-content-font-delta,0px));padding:6px 8px;
  border:0;border-radius:var(--dsw-radius-sm);background:0 0;
  color:var(--dsw-alias-label-tertiary);font:inherit;
  font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);
  font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;
  cursor:pointer;user-select:none;-webkit-user-select:none}
.dsh-cm:hover,.dsh-cm[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-secondary)}
.dsh-cm:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dsh-cm-icon{width:15px;height:15px;flex:none;opacity:.85}
.dsh-cm-num{font-variant-numeric:tabular-nums}
.dsh-cm-sep{opacity:.55;padding:0 1px}
.dsh-cm-cost{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsh-cm-panel{position:fixed;z-index:60;box-sizing:border-box;max-height:min(64vh,440px);
  overflow:auto;padding:10px 12px 12px;border-radius:var(--dsw-radius-lg);
  background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));
  border:1px solid var(--dsw-alias-border-l2);
  box-shadow:var(--dsw-elevation-panel,0 12px 32px rgba(0,0,0,.35));
  color:var(--dsw-alias-label-secondary);
  font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px)}
.dsh-cm-group+.dsh-cm-group{margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-cm-title{font-size:11px;letter-spacing:.04em;text-transform:uppercase;
  color:var(--dsw-alias-label-tertiary);margin-bottom:6px}
.dsh-cm-list{display:grid;grid-template-columns:1fr auto;gap:2px 10px;margin:0}
.dsh-cm-row{display:contents}
.dsh-cm-row dt{margin:0;color:var(--dsw-alias-label-tertiary)}
.dsh-cm-row dd{margin:0;text-align:right;color:var(--dsw-alias-label-primary);
  font-variant-numeric:tabular-nums}
.dsh-cm-total{display:flex;justify-content:space-between;margin-top:6px;
  padding-top:6px;border-top:1px dashed var(--dsw-alias-border-l1)}
.dsh-cm-modes{display:flex;gap:4px;margin-bottom:8px}
.dsh-cm-mode{flex:1;height:24px;border:1px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-tertiary);
  font:inherit;font-size:12px;cursor:pointer}
.dsh-cm-mode:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cm-mode[data-active=true]{border-color:var(--dsw-alias-state-business-primary);
  color:var(--dsw-alias-state-business-primary)}
.dsh-cm-period{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;
  color:var(--dsw-alias-label-tertiary);font-size:11px}
.dsh-cm-chip{padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2)}
.dsh-cm-chip[data-peak=true]{color:var(--dsw-alias-state-warn-primary);
  border-color:var(--dsw-alias-state-warn-primary)}
.dsh-cm-prices{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-top:8px}
.dsh-cm-price{display:flex;flex-direction:column;gap:3px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dsh-cm-price input{box-sizing:border-box;width:100%;height:24px;padding:0 6px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12px;font-variant-numeric:tabular-nums}
.dsh-cm-price input:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:0}
.dsh-cm-hint{margin:6px 0 0;font-size:11px;line-height:15px;color:var(--dsw-alias-label-dimmed)}
.dsh-cm-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.dsh-cm-small{height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;cursor:pointer}
.dsh-cm-small:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-primary)}
.dsh-cm-small:disabled{opacity:.45;cursor:default}
.dsh-cm-status{margin:6px 0 0;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.dsh-cm-vault{display:flex;flex-direction:column;gap:1px;max-height:132px;overflow:auto;margin-top:4px}
.dsh-cm-vault-row{display:flex;align-items:center;gap:8px;width:100%;padding:4px 6px;
  border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;text-align:left;cursor:pointer}
.dsh-cm-vault-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-primary)}
.dsh-cm-vault-row:disabled{opacity:.55;cursor:default}
.dsh-cm-vault-time{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}
.dsh-cm-vault-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cm-vault-meta{flex:none;font-size:11px;color:var(--dsw-alias-label-dimmed);font-variant-numeric:tabular-nums}
`

    /** Apply the browser half. */
    function apply(ctx) {
      // One stylesheet for the app lifetime, owned by this context so an
      // unload removes it again.
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'dsh-composer-meter')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'composer-meter: styles')

      // Dictionaries ride the locale service when the profile has one. Keys
      // still render through the fallback above when it does not.
      ctx.inject(['locale'], (localeCtx) => {
        ctx.effect(() => {
          try {
            return localeCtx.locale.register(NS, DICTS)
          } catch {
            return () => {}
          }
        }, 'composer-meter: dictionaries')
      })

      // The slot service is what this plugin exists for; without it there is
      // simply nothing to draw, and no error worth surfacing.
      ctx.inject(['slots'], (slotsCtx) => {
        const slots = slotsCtx.slots
        return slots.inject('conversation.composer.dock', () => {
          try {
            return slots.register(
              {
                name: 'conversation.composer.dock',
                id: 'composer-meter',
                order: 30,
                locale: NS,
                // The dock is session-scoped, so the registration callback is
                // handed the session id; the vault keys its storage by it.
                inject: (sessionId) => ({ sessionId }),
              },
              Meter,
            )
          } catch (error) {
            console.warn('[dsh-composer-meter] slot registration failed', error)
            return () => {}
          }
        })
      })
    }

    return {
      name: 'dsh-composer-meter',
      inject: [],
      apply,
      // Headless seams for validate.mjs: no React, no DOM, no storage.
      __test: {
        estimateTokens,
        compact,
        formatMoney,
        computeCost,
        classifyDraft,
        countLines,
        isPeakHour,
        resolvePricing,
        normalizePricing,
        cleanDraft,
        trimVault,
        appendSnapshot,
        formatClock,
        vaultPreview,
        PRICE_FIELDS,
        PRICE_PRESETS,
        MODES,
      },
    }
  },
})
