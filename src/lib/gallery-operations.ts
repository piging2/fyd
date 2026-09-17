/**
 * Gallery Operation Helpers
 * 
 * Server-side helpers for constructing gallery mutations.
 * The Workbench UI can use these to build the complete ordered array before calling PUT.
 * 
 * These functions are designed to be used with the new Gallery Management v2 API:
 * PUT /api/admin/projects/gallery
 * 
 * Constitutional Architecture:
 * - Gallery order is human editorial state (not deterministic projection)
 * - One atomic mutation contains the complete desired ordered media-ID sequence
 * - Media identity remains immutable, only ordering changes
 */

/**
 * Prepend new media IDs to beginning of gallery
 * @param currentGallery - Current ordered gallery array
 * @param newMediaIds - Media IDs to prepend (in order to appear)
 * @returns New gallery array with new items at beginning
 * 
 * Example:
 *   currentGallery = [A, B, C]
 *   newMediaIds = [D, E, F]
 *   result = [D, E, F, A, B, C]
 */
export function prependToGallery(currentGallery: string[], newMediaIds: string[]): string[] {
  return [...newMediaIds, ...currentGallery];
}

/**
 * Append new media IDs to end of gallery
 * @param currentGallery - Current ordered gallery array
 * @param newMediaIds - Media IDs to append (in order to appear)
 * @returns New gallery array with new items at end
 * 
 * Example:
 *   currentGallery = [A, B, C]
 *   newMediaIds = [D, E, F]
 *   result = [A, B, C, D, E, F]
 */
export function appendToGallery(currentGallery: string[], newMediaIds: string[]): string[] {
  return [...currentGallery, ...newMediaIds];
}

/**
 * Delete item from gallery by index (compact, no null holes)
 * @param currentGallery - Current ordered gallery array
 * @param index - Index to remove
 * @returns New gallery array with item removed
 * 
 * Example:
 *   currentGallery = [A, B, C, D]
 *   index = 1
 *   result = [A, C, D]
 */
export function deleteFromGallery(currentGallery: string[], index: number): string[] {
  if (index < 0 || index >= currentGallery.length) {
    throw new Error(`Gallery index ${index} out of bounds (length: ${currentGallery.length})`);
  }
  return currentGallery.filter((_, i) => i !== index);
}

/**
 * Move item from one index to another (reorder)
 * @param currentGallery - Current ordered gallery array
 * @param fromIndex - Current index of item to move
 * @param toIndex - Target index
 * @returns New gallery array with item moved
 * 
 * Example:
 *   currentGallery = [A, B, C, D]
 *   fromIndex = 3
 *   toIndex = 0
 *   result = [D, A, B, C]
 */
export function moveInGallery(currentGallery: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || fromIndex >= currentGallery.length) {
    throw new Error(`From index ${fromIndex} out of bounds (length: ${currentGallery.length})`);
  }
  if (toIndex < 0 || toIndex >= currentGallery.length) {
    throw new Error(`To index ${toIndex} out of bounds (length: ${currentGallery.length})`);
  }
  
  const newGallery = [...currentGallery];
  const [movedItem] = newGallery.splice(fromIndex, 1);
  newGallery.splice(toIndex, 0, movedItem);
  
  return newGallery;
}

/**
 * Batch gallery operations
 * Apply multiple operations in sequence and return final state
 * @param currentGallery - Current ordered gallery array
 * @param operations - Array of operations to apply
 * @returns New gallery array after all operations
 * 
 * Example:
 *   currentGallery = [A, B, C, D]
 *   operations = [
 *     { type: 'delete', params: 1 },      // Delete B
 *     { type: 'move', params: { fromIndex: 2, toIndex: 0 } }, // Move D to front
 *     { type: 'prepend', params: [E] }   // Add E at front
 *   ]
 *   result = [E, D, A, C]
 */
export function applyGalleryOperations(
  currentGallery: string[],
  operations: Array<{ type: 'prepend' | 'append' | 'delete' | 'move', params: any }>
): string[] {
  let result = [...currentGallery];
  
  for (const op of operations) {
    switch (op.type) {
      case 'prepend':
        result = prependToGallery(result, op.params);
        break;
      case 'append':
        result = appendToGallery(result, op.params);
        break;
      case 'delete':
        result = deleteFromGallery(result, op.params);
        break;
      case 'move':
        result = moveInGallery(result, op.params.fromIndex, op.params.toIndex);
        break;
    }
  }
  
  return result;
}

/**
 * Gallery operation type definitions
 */
export type GalleryOperation = 
  | { type: 'prepend', params: string[] }
  | { type: 'append', params: string[] }
  | { type: 'delete', params: number }
  | { type: 'move', params: { fromIndex: number, toIndex: number } };
