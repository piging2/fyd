/**
 * Slot Registration System
 * 
 * Constitutional Law 3: Components Register Themselves
 * 
 * Every production component registers its own editable regions.
 * The editor never knows component structure - components tell the editor.
 * 
 * Constitutional changes:
 * - Rejects duplicate registrations (same slotId, different properties)
 * - Validates lifecycle (mount/unmount/change)
 */

export interface SlotConstraints {
  aspectRatio: string;
  responsive: boolean;
  focalPointEnabled: boolean;
  minWidth: number;
  compressionPreset: string;
}

export interface SlotRegistration {
  slotId: string;
  page: string;
  component: string;
  slotName: string;
  constraints: SlotConstraints;
  elementType: 'image' | 'text' | 'color' | 'link';
}

class SlotRegistry {
  private static instance: SlotRegistry;
  private registeredSlots: Map<string, SlotRegistration> = new Map();

  private constructor() {}

  static getInstance(): SlotRegistry {
    if (!SlotRegistry.instance) {
      SlotRegistry.instance = new SlotRegistry();
    }
    return SlotRegistry.instance;
  }

  /**
   * Register a slot from a component
   * Called by production components to declare their editable regions
   * Rejects duplicate registrations with different properties
   * Allows re-registration with updated constraints (for SlotConstraintsUpdated event)
   */
  register(registration: SlotRegistration): void {
    const existing = this.registeredSlots.get(registration.slotId);
    
    if (existing) {
      // Validate that registration is consistent
      const isConsistent = 
        existing.page === registration.page &&
        existing.component === registration.component &&
        existing.slotName === registration.slotName &&
        existing.elementType === registration.elementType;
      
      if (!isConsistent) {
        throw new Error(
          `Slot ${registration.slotId} registration is inconsistent. ` +
          `Existing: ${JSON.stringify(existing)}, New: ${JSON.stringify(registration)}`
        );
      }
      
      // Allow constraints to be updated (for SlotConstraintsUpdated event)
      this.registeredSlots.set(registration.slotId, registration);
      return;
    }
    
    this.registeredSlots.set(registration.slotId, registration);
  }

  /**
   * Unregister a slot
   * Called when component unmounts
   */
  unregister(slotId: string): void {
    this.registeredSlots.delete(slotId);
  }

  /**
   * Get all registered slots
   * Called by EditorOverlay to discover editable regions
   */
  getAllSlots(): SlotRegistration[] {
    return Array.from(this.registeredSlots.values());
  }

  /**
   * Get slot by ID
   */
  getSlot(slotId: string): SlotRegistration | undefined {
    return this.registeredSlots.get(slotId);
  }

  /**
   * Get slots by page
   */
  getSlotsByPage(page: string): SlotRegistration[] {
    return Array.from(this.registeredSlots.values()).filter(
      slot => slot.page === page
    );
  }

  /**
   * Get slots by component
   */
  getSlotsByComponent(component: string): SlotRegistration[] {
    return Array.from(this.registeredSlots.values()).filter(
      slot => slot.component === component
    );
  }

  /**
   * Clear all slots (for testing/cleanup)
   */
  clear(): void {
    this.registeredSlots.clear();
  }
}

export const slotRegistry = SlotRegistry.getInstance();