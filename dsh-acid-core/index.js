/**
 * Host half of dsh-acid-core.
 *
 * Everything this plugin does is browser-side: the backdrop is a WebGL canvas,
 * the sandbox is a HUD, and the palette is a client theme layer. The Host only
 * needs a resolvable row for the browser half to bind to, and that row has to
 * be a valid plugin — an empty `apply` is the whole Host surface.
 *
 * Keep this file import-free: a throwing import takes the row down, and the
 * browser half loses its owner with it.
 */
export function apply() {}
