/**
 * Editable Slot Component
 * 
 * Constitutional Law 3: Components Register Themselves
 * 
 * Production components use this to declare editable regions.
 * The EditorOverlay discovers these registered slots automatically.
 */

'use client';

import React, { useEffect, useRef, cloneElement } from 'react';
import { slotRegistry, SlotRegistration, SlotConstraints } from '@/lib/editor/slot-registry';

interface EditableSlotProps {
  slotId: string;
  page: string;
  component: string;
  slotName: string;
  constraints: SlotConstraints;
  elementType?: 'image' | 'text' | 'color' | 'link';
  children: React.ReactNode;
}

export function EditableSlot({
  slotId,
  page,
  component,
  slotName,
  constraints,
  elementType = 'image',
  children
}: EditableSlotProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  // Register this slot with the global registry
  useEffect(() => {
    const registration: SlotRegistration = {
      slotId,
      page,
      component,
      slotName,
      constraints,
      elementType
    };
    
    slotRegistry.register(registration);
    
    return () => {
      slotRegistry.unregister(slotId);
    };
  }, [slotId, page, component, slotName, constraints, elementType]);

  // Store DOM element reference for overlay positioning
  useEffect(() => {
    if (elementRef.current) {
      // Store element reference for EditorOverlay to use
      // This follows Constitutional Law 4: DOM is ephemeral
      // Only used for positioning, not for truth
      elementRef.current.dataset.slotId = slotId;
    }
  }, [slotId]);

  // Clone child to attach ref and data attribute while preserving structure
  if (React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return cloneElement(child, {
      ref: elementRef,
      'data-slot-id': slotId,
      className: `${child.props.className || ''} editable-slot`
    } as any);
  }

  // Fallback to wrapper if child is not a valid element
  return (
    <div ref={elementRef} data-slot-id={slotId} className="editable-slot">
      {children}
    </div>
  );
}