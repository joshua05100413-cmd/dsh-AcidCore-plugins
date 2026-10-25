/**
 * dsh-composer-meter — browser half.
 *
 * One right-aligned line under the composer: how many characters the current
 * draft holds and roughly how many tokens that is. It renders nothing while
 * the draft is empty, so the dock stays as quiet as it is today.
 *
 * Wiring
 *   - slot: `conversation.composer.dock` (list, session scope). It is the row
 *     the host already allocates under the composer card, next to its own
 *     context meter, so this adds a line instead of covering one.
 *   - data: the standard session kit seats `useInput` on every composer child
 *     slot; the draft comes from that live input snapshot (the same source the
 *     host composer renders from), never from the DOM.
 *
 * Failure policy: the Web shell treats a client entry that never activates as
 * a boot failure, so `inject` stays empty and every optional service is taken
 * through `ctx.inject`, which simply never runs on a profile without it. A
 * registration that throws is swallowed and logged; the composer keeps working
 * without the meter.
 */

window.__ModuleLoader__.load({
  id: 'dsh-composer-meter',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace of the browser half; also the registration locale. */
    const NS = 'composerMeter'

    /** Copy used when no locale service is mounted, so keys never render raw. */
    const DICTS = {
      zh: {
        'meta.title': '输入计量',
        'meta.description': '在输入框下方实时显示草稿字数与预估 token 数。',
        chars: '字',
        tokens: 'tokens',
        estimate: '≈',
        hint: '估算值，实际以模型分词器为准。',
      },
      en: {
        'meta.title': 'Composer Meter',
        'meta.description': 'Live character count and a rough token estimate for the draft, under the composer.',
        chars: 'chars',
        tokens: 'tokens',
        estimate: '≈',
        hint: 'Rough estimate; the model tokenizer decides the real count.',
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

    /** The meter itself. Rendered only when the draft is non-empty. */
    function Meter(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const useInput = props.useInput
      // A one-field selector: the input snapshot is a large object, and
      // subscribing to the whole thing would re-render this line on every
      // attachment or phase change too.
      const draft = useInput((state) => {
        const value = state !== null && typeof state === 'object' ? state.draft : undefined
        return typeof value === 'string' ? value : ''
      })

      if (draft === '') return null

      const chars = [...draft].length
      const tokens = estimateTokens(draft)
      const hint = t('hint')

      return h(
        'div',
        {
          className: 'dsh-cm',
          'data-plugin': 'dsh-composer-meter',
          title: hint,
        },
        h('span', { className: 'dsh-cm-num' }, chars, ' ', t('chars')),
        h('span', { className: 'dsh-cm-sep', 'aria-hidden': true }, '·'),
        h('span', { className: 'dsh-cm-num' }, t('estimate'), ' ', compact(tokens), ' ', t('tokens')),
      )
    }

    /**
     * Slot entry. The composer child slots normally seat `useInput`; a host
     * that does not would make the hook call below throw during render, which
     * React answers by unmounting this entry behind its error boundary. The
     * props check here keeps that degradation to "no meter".
     */
    function MeterEntry(props) {
      if (typeof props.useInput !== 'function') return null
      return h(Meter, props)
    }

    const CSS = `
.dsh-cm{display:flex;align-items:center;justify-content:flex-end;gap:5px;
  padding:6px 2px 0;font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;
  user-select:none;-webkit-user-select:none;pointer-events:none;white-space:nowrap}
.dsh-cm-num{font-weight:500}
.dsh-cm-sep{color:var(--dsw-alias-label-dimmed);opacity:.6}
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
              { name: 'conversation.composer.dock', id: 'composer-meter', order: 30, locale: NS },
              MeterEntry,
            )
          } catch (error) {
            console.warn('[dsh-composer-meter] slot registration failed', error)
            return () => {}
          }
        })
      })
    }

    return { name: 'dsh-composer-meter', inject: [], apply }
  },
})
