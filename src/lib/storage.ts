/**
 * Safe Storage Utilities
 * 
 * Provides error-wrapped localStorage access to prevent crashes when
 * localStorage is unavailable (private browsing, storage quota exceeded, etc.)
 */

export function safeGetItem(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`localStorage.getItem failed for key "${key}":`, error);
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`localStorage.setItem failed for key "${key}":`, error);
    return false;
  }
}

export function safeRemoveItem(key: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`localStorage.removeItem failed for key "${key}":`, error);
    return false;
  }
}
