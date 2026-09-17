/**
 * Workbench Ordering Adapter
 * 
 * Manages Workbench-specific photo ordering overlay.
 * MAIN authorities remain immutable.
 * 
 * Architecture:
 * - MAIN (media.v1.json, projects.v1.json) = canonical immutable reference
 * - workbench-ordering.v1.json = operational overlay for operator preferences
 * - Load = merge MAIN baseline + Workbench overlay
 * - Save = persist only Workbench overlay
 * - Reset = discard overlay, restore MAIN baseline
 */

import { loadAuthority, clearAuthorityCache } from './authority-loader';

export interface WorkbenchOrdering {
  version: string;
  generatedAt: string;
  baseline: {
    source: string;
    commit: string;
  };
  orderVersion: number;
  orders: MediaOrder[];
}

export interface MediaOrder {
  mediaId: string;
  position: number;
  scope: 'global' | 'project' | 'brand';
  projectId?: string;
}

/**
 * Load Workbench ordering overlay
 */
export function loadWorkbenchOrdering(): WorkbenchOrdering {
  return loadAuthority<WorkbenchOrdering>({
    path: '@/config/workbench-ordering.v1.json',
    fallback: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      baseline: {
        source: 'main',
        commit: '5ba201cd354b4cc2ba95f9612c39e08d813ffab1'
      },
      orderVersion: 1,
      orders: []
    },
    name: 'WorkbenchOrdering'
  });
}

/**
 * Save Workbench ordering overlay
 */
export function saveWorkbenchOrdering(ordering: WorkbenchOrdering): void {
  // This would typically write to the file system
  // For now, we use localStorage as a simple persistence mechanism
  if (typeof window !== 'undefined') {
    localStorage.setItem('workbench-ordering', JSON.stringify(ordering));
  }
}

/**
 * Load saved ordering from localStorage
 */
export function loadSavedOrdering(): WorkbenchOrdering | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const saved = localStorage.getItem('workbench-ordering');
    if (saved) {
      return JSON.parse(saved) as WorkbenchOrdering;
    }
  } catch (err) {
    console.error('Failed to load saved ordering:', err);
  }
  
  return null;
}

/**
 * Clear Workbench ordering cache
 */
export function clearWorkbenchOrderingCache(): void {
  clearAuthorityCache('@/config/workbench-ordering.v1.json');
  if (typeof window !== 'undefined') {
    localStorage.removeItem('workbench-ordering');
  }
}

/**
 * Reset to MAIN baseline
 */
export function resetToMainBaseline(): void {
  clearWorkbenchOrderingCache();
}
