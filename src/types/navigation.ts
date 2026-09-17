/**
 * Navigation Authority Types
 * 
 * Site navigation as a constitutional authority.
 */

export interface NavItem {
  label: string;
  href: string;
  secondary?: boolean;
}

export interface NavigationManifest {
  version: string;
  generatedAt: string;
  navigation: NavItem[];
}
