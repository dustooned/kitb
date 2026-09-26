// Local-only UI state: which pieces are selected, hovered, or have a menu open.
import { useSyncExternalStore } from 'react';

export interface MenuState { x: number; y: number; id: string; source: 'table' | 'marker' | 'note' }

class UiState {
  selected = new Set<string>();
  hovered: string | null = null;
  menu: MenuState | null = null;
  spaceHeld = false;
  version = 0;
  private lastOrbit = 0;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private changed() { this.version++; for (const fn of this.listeners) fn(); }

  select(ids: string[]) { this.selected = new Set(ids); this.changed(); }
  toggle(id: string) { const s = new Set(this.selected); if (s.has(id)) s.delete(id); else s.add(id); this.selected = s; this.changed(); }
  clear() { if (this.selected.size || this.menu) { this.selected = new Set(); this.menu = null; this.changed(); } }
  hover(id: string | null) { if (this.hovered !== id) { this.hovered = id; this.changed(); } }
  /** True right after a right-drag orbit — on Windows the contextmenu event fires on right-button
   *  *release*, so a piece under the cursor would otherwise get selected and pop a menu. */
  justOrbited() { return performance.now() - this.lastOrbit < 300; }
  openMenu(menu: MenuState | null) {
    if (menu && this.justOrbited()) return;
    this.menu = menu; this.changed();
  }
  /** Called when a right-drag orbit ends, so its button release doesn't also open a menu. */
  markOrbit() { this.lastOrbit = performance.now(); }

  /** Keyboard shortcuts act on the selection, or the hovered piece if nothing is selected.
   *  `stillThere` drops ids that have since left the table. */
  targets(stillThere: (id: string) => boolean = () => true): string[] {
    const ids = this.selected.size ? [...this.selected] : this.hovered ? [this.hovered] : [];
    return ids.filter(stillThere);
  }
}

export const ui = new UiState();

export function useUi() {
  useSyncExternalStore(ui.subscribe, ui.getVersion);
  return ui;
}
