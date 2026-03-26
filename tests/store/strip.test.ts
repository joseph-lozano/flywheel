import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createStripStore } from '../../src/renderer/src/store/strip'

function withStore(fn: (store: ReturnType<typeof createStripStore>) => void) {
  createRoot((dispose) => { const store = createStripStore('test-row'); fn(store); dispose() })
}

describe('createStripStore', () => {
  it('starts with no panels', () => {
    withStore(({ state }) => {
      expect(state.panels).toHaveLength(0)
      expect(state.focusedIndex).toBe(0)
      expect(state.scrollOffset).toBe(0)
    })
  })
})

describe('addPanel', () => {
  it('inserts panel after focused index', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel()
      expect(state.panels).toHaveLength(1)
      expect(state.panels[0].id).toBe(p1.id)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('focuses newly added panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      expect(state.panels).toHaveLength(2)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('inserts after current focus, not at end', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.jumpTo(0); actions.addPanel()
      expect(state.panels).toHaveLength(3)
      expect(state.focusedIndex).toBe(1)
      expect(state.panels[1].id).not.toBe(state.panels[0].id)
    })
  })

  it('assigns sequential colors from palette', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.addPanel()
      expect(state.panels[0].color).toBe('#6366f1')
      expect(state.panels[1].color).toBe('#10b981')
      expect(state.panels[2].color).toBe('#f59e0b')
    })
  })
})

describe('removePanel', () => {
  it('removes focused panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.jumpTo(0)
      expect(actions.removePanel()).toBeTruthy()
      expect(state.panels).toHaveLength(1)
    })
  })

  it('moves focus to nearest neighbor after removal', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.addPanel()
      actions.jumpTo(1); actions.removePanel()
      expect(state.panels).toHaveLength(2)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('clamps focus when removing last panel in list', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.removePanel()
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('returns null when no panels', () => {
    withStore(({ actions }) => { expect(actions.removePanel()).toBeNull() })
  })
})

describe('focus navigation', () => {
  it('focusLeft decrements index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.focusLeft()
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('focusLeft clamps at 0', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.jumpTo(0); actions.focusLeft()
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('focusRight increments index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.jumpTo(0); actions.focusRight()
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('focusRight clamps at last panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.focusRight()
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('jumpTo sets focus to specific index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.addPanel()
      actions.jumpTo(0); expect(state.focusedIndex).toBe(0)
      actions.jumpTo(2); expect(state.focusedIndex).toBe(2)
    })
  })

  it('jumpTo ignores out-of-range index', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.jumpTo(5); expect(state.focusedIndex).toBe(0)
      actions.jumpTo(-1); expect(state.focusedIndex).toBe(0)
    })
  })
})

describe('viewport', () => {
  it('sets viewport dimensions', () => {
    withStore(({ state, actions }) => {
      actions.setViewport(1920, 1080)
      expect(state.viewportWidth).toBe(1920)
      expect(state.viewportHeight).toBe(1080)
    })
  })
})

describe('scrollOffset', () => {
  it('sets scroll offset', () => {
    withStore(({ state, actions }) => {
      actions.setScrollOffset(150)
      expect(state.scrollOffset).toBe(150)
    })
  })
})

describe('terminalFocused (blur)', () => {
  it('starts with terminalFocused true', () => {
    withStore(({ state }) => { expect(state.terminalFocused).toBe(true) })
  })
  it('blurPanel sets terminalFocused to false', () => {
    withStore(({ state, actions }) => { actions.blurPanel(); expect(state.terminalFocused).toBe(false) })
  })
  it('focusLeft re-enables terminalFocused', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.blurPanel(); actions.focusLeft()
      expect(state.terminalFocused).toBe(true)
    })
  })
  it('focusRight re-enables terminalFocused', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.jumpTo(0); actions.blurPanel(); actions.focusRight()
      expect(state.terminalFocused).toBe(true)
    })
  })
  it('jumpTo re-enables terminalFocused', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel(); actions.blurPanel(); actions.jumpTo(0)
      expect(state.terminalFocused).toBe(true)
    })
  })
})

describe('removePanelById', () => {
  it('removes panel by id', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      actions.removePanelById(p1.id)
      expect(state.panels).toHaveLength(1); expect(state.panels[0].id).toBe(p2.id)
    })
  })
  it('adjusts focusedIndex when removing before focused', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); actions.addPanel(); actions.addPanel()
      actions.jumpTo(2); actions.removePanelById(p1.id)
      expect(state.focusedIndex).toBe(1)
    })
  })
  it('clamps focusedIndex when removing focused panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); const p2 = actions.addPanel()
      actions.removePanelById(p2.id); expect(state.focusedIndex).toBe(0)
    })
  })
  it('returns null for unknown id', () => {
    withStore(({ actions }) => { expect(actions.removePanelById('nonexistent')).toBeNull() })
  })
})

describe('swap', () => {
  it('swapLeft swaps focused panel with left neighbor', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      // p2 is focused at index 1
      actions.swapLeft()
      expect(state.panels[0].id).toBe(p2.id)
      expect(state.panels[1].id).toBe(p1.id)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('swapRight swaps focused panel with right neighbor', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      actions.jumpTo(0)
      actions.swapRight()
      expect(state.panels[0].id).toBe(p2.id)
      expect(state.panels[1].id).toBe(p1.id)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('swapLeft is no-op at leftmost position', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      actions.jumpTo(0)
      actions.swapLeft()
      expect(state.panels[0].id).toBe(p1.id)
      expect(state.panels[1].id).toBe(p2.id)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('swapRight is no-op at rightmost position', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel()
      // p2 is focused at index 1 (rightmost)
      actions.swapRight()
      expect(state.panels[0].id).toBe(p1.id)
      expect(state.panels[1].id).toBe(p2.id)
      expect(state.focusedIndex).toBe(1)
    })
  })

  it('swap is no-op with single panel', () => {
    withStore(({ state, actions }) => {
      actions.addPanel()
      actions.swapLeft()
      actions.swapRight()
      expect(state.panels).toHaveLength(1)
      expect(state.focusedIndex).toBe(0)
    })
  })

  it('swapLeft sets terminalFocused to true', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.blurPanel()
      actions.swapLeft()
      expect(state.terminalFocused).toBe(true)
    })
  })

  it('swapRight sets terminalFocused to true', () => {
    withStore(({ state, actions }) => {
      actions.addPanel(); actions.addPanel()
      actions.jumpTo(0); actions.blurPanel()
      actions.swapRight()
      expect(state.terminalFocused).toBe(true)
    })
  })

  it('swapLeft preserves panel identity through three panels', () => {
    withStore(({ state, actions }) => {
      const p1 = actions.addPanel(); const p2 = actions.addPanel(); const p3 = actions.addPanel()
      // focused on p3 at index 2
      actions.swapLeft()
      expect(state.panels.map(p => p.id)).toEqual([p1.id, p3.id, p2.id])
      expect(state.focusedIndex).toBe(1)
    })
  })
})

describe('browser panels', () => {
  it('addPanel with browser type sets type and url', () => {
    withStore(({ state, actions }) => {
      const panel = actions.addPanel('browser', 'http://localhost:3000')
      expect(panel.type).toBe('browser')
      expect(panel.url).toBe('http://localhost:3000')
      expect(state.panels[0].type).toBe('browser')
      expect(state.panels[0].url).toBe('http://localhost:3000')
    })
  })

  it('addPanel with browser type uses url as initial label', () => {
    withStore(({ state, actions }) => {
      actions.addPanel('browser', 'http://localhost:3000')
      expect(state.panels[0].label).toBe('http://localhost:3000')
    })
  })

  it('setPanelUrl updates url on panel', () => {
    withStore(({ state, actions }) => {
      const panel = actions.addPanel('browser', 'http://localhost:3000')
      actions.setPanelUrl(panel.id, 'http://localhost:3000/about')
      expect(state.panels[0].url).toBe('http://localhost:3000/about')
    })
  })

  it('setPanelUrl ignores unknown panel id', () => {
    withStore(({ state, actions }) => {
      actions.addPanel('browser', 'http://localhost:3000')
      actions.setPanelUrl('unknown', 'http://example.com')
      expect(state.panels[0].url).toBe('http://localhost:3000')
    })
  })

  it('browser panel sets terminalFocused so it gets focus', () => {
    withStore(({ state, actions }) => {
      actions.blurPanel()
      actions.addPanel('browser', 'http://localhost:3000')
      expect(state.terminalFocused).toBe(true)
    })
  })
})

describe('rowId panel ID generation', () => {
  it('prefixes panel IDs with rowId', () => {
    createRoot((dispose) => {
      const store = createStripStore('row-abc')
      const panel = store.actions.addPanel('terminal')
      expect(panel.id).toMatch(/^row-abc-panel-/)
      dispose()
    })
  })
})

describe('getSnapshot and restore', () => {
  it('snapshots current state', () => {
    createRoot((dispose) => {
      const store = createStripStore('row-1')
      store.actions.addPanel('terminal')
      store.actions.addPanel('terminal')
      store.actions.setScrollOffset(100)
      const snapshot = store.getSnapshot()
      expect(snapshot.panels).toHaveLength(2)
      expect(snapshot.scrollOffset).toBe(100)
      expect(snapshot.focusedIndex).toBe(1)
      dispose()
    })
  })

  it('restores from snapshot', () => {
    createRoot((dispose) => {
      const store = createStripStore('row-1')
      store.actions.addPanel('terminal')
      store.actions.addPanel('terminal')
      store.actions.setScrollOffset(100)
      const snapshot = store.getSnapshot()

      const store2 = createStripStore('row-1')
      store2.restore(snapshot)
      expect(store2.state.panels).toHaveLength(2)
      expect(store2.state.scrollOffset).toBe(100)
      expect(store2.state.focusedIndex).toBe(1)
      dispose()
    })
  })
})
