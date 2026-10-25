/**
 * Host half of dsh-composer-meter.
 *
 * The plugin is browser-only: every pixel it draws comes from `client.js`
 * through the Web shell's slot system. The Host still needs a row so the
 * browser half has an owner to bind to, and that row must be a valid plugin
 * with an `apply` export — an empty one is the whole Host surface.
 *
 * Keep this file import-free: a Host-half import that fails takes the row
 * down with it, and the browser half then has no owner.
 */
export function apply() {}
