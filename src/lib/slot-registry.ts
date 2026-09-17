/**
 * Slot Registry - Runtime registration of website visual slots
 * 
 * Purpose: Allow actual website components to register their image slots
 * - Components wrap images with VisualSlot
 * - VisualSlot registers itself to this registry
 * - Workbench consumes registry to get slot mappings
 * - Single source of truth: website components declare their own slots
 * 
 * Architecture:
 * - VisualSlot component registers on mount, unregisters on unmount
 * - Registry stores slot metadata (id, route, section, currentMediaId)
 * - Workbench reads registry to enable click selection and drag/drop
 * - Uses postMessage for iframe cross-frame communication
 */

export interface RegisteredSlot {
  id: string;
  route: string;
  page: string;
  section: string;
  slotName: string;
  currentMediaId: string | null;
  element: HTMLElement | null;
  component: string;
}

// Origin security for cross-frame Workbench messaging.
// Dev is permissive (matches the existing NODE_ENV==='development' auth bypass);
// production requires the peer origin to be in an allowlist (default: same-origin).
function isProductionMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

function getAllowedOrigins(): string[] {
  const configured = process.env.NEXT_PUBLIC_WORKBENCH_ALLOWED_ORIGINS;
  if (configured) {
    return configured.split(',').map((o) => o.trim()).filter(Boolean);
  }
  if (typeof window !== 'undefined') return [window.location.origin];
  return [];
}

function isAllowedOrigin(origin: string): boolean {
  if (!isProductionMode()) return true; // dev: permissive, matches existing bypass
  return getAllowedOrigins().includes(origin);
}

function getTargetOrigin(): string {
  if (!isProductionMode()) return '*'; // dev: permissive
  const configured = process.env.NEXT_PUBLIC_WORKBENCH_TARGET_ORIGIN;
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '*';
}

class SlotRegistry {
  private slots: Map<string, RegisteredSlot> = new Map();
  private listeners: Set<() => void> = new Set();
  private isWorkbenchMode = false;
  private readonly instanceId: string;

  constructor() {
    this.instanceId = `REG-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    console.log('[REGISTRY] CONSTRUCTOR', {
      instanceId: this.instanceId,
      isBrowser: typeof window !== 'undefined',
      windowLocation: typeof window !== 'undefined' ? window.location.pathname : 'SSR',
      windowSearch: typeof window !== 'undefined' ? window.location.search : 'SSR',
      timestamp: new Date().toISOString(),
    });

    if (typeof window !== 'undefined') {
      this.isWorkbenchMode = window.location.pathname.startsWith('/workbench');
      
      console.log('[REGISTRY] WORKBENCH_MODE_DETECTION', {
        instanceId: this.instanceId,
        isWorkbenchMode: this.isWorkbenchMode,
        pathname: window.location.pathname,
        search: window.location.search,
        hasWorkbenchParam: window.location.search.includes('workbench=true'),
      });
      
      if (this.isWorkbenchMode) {
        window.addEventListener('message', this.handleMessage);
        console.log('[REGISTRY] MESSAGE_LISTENER_ATTACHED', { instanceId: this.instanceId });
      }
    }
  }

  // Use composite key (route + slotId) to prevent collisions across different pages
  private makeKey(slot: RegisteredSlot): string {
    return `${slot.route}:${slot.id}`;
  }

  private handleMessage = (event: MessageEvent) => {
    // Filter: Only process Workbench protocol messages
    if (!event.data || typeof event.data.type !== 'string') {
      return;
    }

    const messageType = event.data.type;

    // Reject messages from unauthorized origins (production only; dev is permissive)
    if (!isAllowedOrigin(event.origin)) {
      console.warn('[REGISTRY] REJECTED_MESSAGE_FROM_UNAUTHORIZED_ORIGIN', {
        type: messageType,
        origin: event.origin,
      });
      return;
    }

    if (messageType === 'SLOT_REGISTER') {
      console.log('[FORENSIC] SLOT REGISTRY MESSAGE RECEIVED', {
        type: messageType,
        origin: event.origin,
        slotId: event.data.slot?.id,
      });
      // Reconstruct slot with element as null (cannot send HTMLElement across iframe)
      this.register({ ...event.data.slot, element: null });
    } else if (messageType === 'SLOT_UNREGISTER') {
      console.log('[FORENSIC] SLOT REGISTRY MESSAGE RECEIVED', {
        type: messageType,
        origin: event.origin,
        slotId: event.data.slotId,
      });
      this.unregister(event.data.slotId);
    } else if (messageType === 'SLOT_CLICK') {
      console.log('[FORENSIC] SLOT REGISTRY MESSAGE RECEIVED', {
        type: messageType,
        origin: event.origin,
        slotId: event.data.slot?.id,
      });
      // Forward slot click events to window for workbench to handle
      window.dispatchEvent(new CustomEvent('slot-click', { detail: event.data.slot }));
    } else if (messageType === 'delete-gallery') {
      console.log('[FORENSIC] GALLERY DELETE MESSAGE RECEIVED', {
        type: messageType,
        origin: event.origin,
        slotId: event.data.slotId,
      });
      // Forward gallery delete events to window for workbench to handle
      window.dispatchEvent(new CustomEvent('delete-gallery', { detail: event.data }));
    } else if (messageType === 'add-to-gallery') {
      console.log('[FORENSIC] GALLERY ADD MESSAGE RECEIVED', {
        type: messageType,
        origin: event.origin,
        slotId: event.data.slotId,
        projectId: event.data.projectId,
      });
      // Forward gallery add events to window for workbench to handle
      window.dispatchEvent(new CustomEvent('add-to-gallery', { detail: event.data }));
    }
    // Ignore all other message types (Next.js HMR, devtools, etc.)
  };

  register(slot: RegisteredSlot) {
    console.log('[REGISTRY] REGISTER_START', {
      instanceId: this.instanceId,
      slotId: slot.id,
      route: slot.route,
      compositeKey: this.makeKey(slot),
      currentMediaId: slot.currentMediaId,
      isWorkbenchMode: this.isWorkbenchMode,
      parentWindow: typeof window !== 'undefined' ? window.parent !== window : 'N/A',
      currentSlotCount: this.slots.size,
    });
    
    this.slots.set(this.makeKey(slot), slot);
    
    console.log('[REGISTRY] REGISTER_COMPLETE', {
      instanceId: this.instanceId,
      slotId: slot.id,
      newSlotCount: this.slots.size,
      allSlots: Array.from(this.slots.keys()),
    });

    // If in regular page mode and workbench is open, notify parent
    if (!this.isWorkbenchMode && typeof window !== 'undefined' && window.parent !== window) {
      console.log('[REGISTRY] POSTMESSAGE_PREPARE', {
        instanceId: this.instanceId,
        slotId: slot.id,
        targetOrigin: getTargetOrigin(),
      });
      
      // Remove element before sending (cannot clone HTMLElement)
      const { element, ...slotWithoutElement } = slot;
      
      console.log('[REGISTRY] POSTMESSAGE_SEND', {
        instanceId: this.instanceId,
        slotId: slot.id,
        message: { type: 'SLOT_REGISTER', slot: slotWithoutElement },
      });
      
      window.parent.postMessage({
        type: 'SLOT_REGISTER',
        slot: slotWithoutElement,
      }, getTargetOrigin());
      
      console.log('[REGISTRY] POSTMESSAGE_SENT', {
        instanceId: this.instanceId,
        slotId: slot.id,
      });
    } else {
      const skipReason = !this.isWorkbenchMode ? 'in workbench mode' : 'no parent window';
      console.log('[REGISTRY] POSTMESSAGE_SKIPPED', {
        instanceId: this.instanceId,
        slotId: slot.id,
        reason: skipReason,
      });
    }

    this.notify();
  }

  unregister(slotId: string, route?: string) {
    // If route provided, use composite key for direct lookup
    if (route) {
      this.slots.delete(`${route}:${slotId}`);
    } else {
      // Fallback: search by slotId alone (for backward compatibility)
      for (const [key, slot] of this.slots.entries()) {
        if (slot.id === slotId) {
          this.slots.delete(key);
          break;
        }
      }
    }
    
    // If in regular page mode and workbench is open, notify parent
    if (!this.isWorkbenchMode && typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage({
        type: 'SLOT_UNREGISTER',
        slotId,
      }, getTargetOrigin());
    }
    
    this.notify();
  }

  get(slotId: string, route?: string): RegisteredSlot | undefined {
    if (route) {
      return this.slots.get(`${route}:${slotId}`);
    }
    // Fallback: search by slotId alone (for backward compatibility)
    for (const slot of this.slots.values()) {
      if (slot.id === slotId) {
        return slot;
      }
    }
    return undefined;
  }

  getAll(): RegisteredSlot[] {
    console.log('[REGISTRY] GET_ALL', {
      instanceId: this.instanceId,
      count: this.slots.size,
      slots: Array.from(this.slots.keys()),
    });
    return Array.from(this.slots.values());
  }

  getByRoute(route: string): RegisteredSlot[] {
    return this.getAll().filter(slot => slot.route === route);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  clear() {
    this.slots.clear();
    this.notify();
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.handleMessage);
    }
  }

  // Allow programmatic slot creation (for Workbench "Add Slot" feature)
  addSlot(slot: Omit<RegisteredSlot, 'element'>) {
    const fullSlot: RegisteredSlot = {
      ...slot,
      element: null, // No DOM element for programmatically added slots
    };
    this.register(fullSlot);
  }

  // Remove a slot programmatically
  removeSlot(slotId: string, route: string) {
    this.unregister(slotId, route);
  }
}

// Singleton instance with browser-global singleton for chunk deduplication
function getSlotRegistrySingleton(): SlotRegistry {
  console.log('[REGISTRY] SINGLETON_ACCESS', {
    isBrowser: typeof window !== 'undefined',
    hasWindowGlobal: typeof window !== 'undefined' && (window as any).__SLOT_REGISTRY__,
  });
  
  if (typeof window === 'undefined') {
    // Server-side: return module instance
    console.log('[REGISTRY] SINGLETON_SERVER_SIDE');
    return new SlotRegistry();
  }
  
  // Browser-side: use window singleton to ensure single instance across chunks
  if (!(window as any).__SLOT_REGISTRY__) {
    console.log('[REGISTRY] SINGLETON_CREATING_BROWSER_GLOBAL');
    (window as any).__SLOT_REGISTRY__ = new SlotRegistry();
  } else {
    console.log('[REGISTRY] SINGLETON_REUSE_BROWSER_GLOBAL');
  }
  
  console.log('[REGISTRY] SINGLETON_RETURN', {
    instanceId: (window as any).__SLOT_REGISTRY__.instanceId,
  });
  
  return (window as any).__SLOT_REGISTRY__;
}

export const slotRegistry = getSlotRegistrySingleton();
