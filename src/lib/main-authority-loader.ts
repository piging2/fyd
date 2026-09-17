/**
 * Main Authority Loader
 * 
 * Loads configuration from Aug 3 baseline (main) for Workbench preview.
 * This allows the Workbench preview to display the actual main website
 * while the Workbench itself uses current configuration for media management.
 * 
 * Usage:
 * - Workbench preview uses main authority loader
 * - Workbench media panel uses current authority loader
 * - Main branch remains unchanged
 */

import type { Media, MediaManifest } from "@/types/media";
import type { Project } from "@/types/projects";

export function loadMainMediaManifest(): MediaManifest {
  // Load from Aug 3 baseline extracted files
  try {
    const mainMedia = require('@/config/media.v1.main.json');
    // Convert Aug 3 format to current MediaManifest format if needed
    return {
      version: mainMedia.version || "1.0.0",
      generatedAt: mainMedia.generatedAt || new Date().toISOString(),
      media: mainMedia.media || []
    };
  } catch (error) {
    console.error('Failed to load main media manifest:', error);
    return { version: "1.0.0", generatedAt: new Date().toISOString(), media: [] };
  }
}

export function loadMainProjectsAuthority(): any {
  try {
    const mainProjects = require('@/config/projects.v1.main.json');
    return mainProjects;
  } catch (error) {
    console.error('Failed to load main projects authority:', error);
    return { version: "1.0.0", projects: [] };
  }
}

export function loadMainServicesAuthority(): any {
  try {
    const mainServices = require('@/config/services.v1.main.json');
    return mainServices;
  } catch (error) {
    console.error('Failed to load main services authority:', error);
    return { version: "1.0.0", services: [] };
  }
}

export function loadMainBrandAuthority(): any {
  try {
    const mainBrand = require('@/config/brand.v1.main.json');
    return mainBrand;
  } catch (error) {
    console.error('Failed to load main brand authority:', error);
    return { version: "1.0.0", homepageHero: null, ownerPortrait: null };
  }
}

export function getMainMediaById(id: string): Media | null {
  const manifest = loadMainMediaManifest();
  return manifest.media.find((m: Media) => m.id === id) || null;
}

export function getMainProjectMedia(projectId: string) {
  const manifest = loadMainMediaManifest();
  const projectMedia = manifest.media.filter((m: Media) => m.projectId === projectId);
  return projectMedia.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getMainProjectHero(projectId: string): Media | null {
  const projectMedia = getMainProjectMedia(projectId);
  return projectMedia.find((m: Media) => m.roles && m.roles.includes('hero')) || null;
}

export function getMainFeaturedServiceMedia(serviceSlug: string): Media | null {
  const manifest = loadMainMediaManifest();
  const projects = loadMainProjectsAuthority().projects;
  
  const serviceProjects = projects.filter((p: any) => p.service === serviceSlug);
  const completedProjects = serviceProjects.filter((p: any) => p.status === 'completed');
  
  if (completedProjects.length === 0) return null;
  
  const featuredProjects = completedProjects.filter((p: any) => p.featured);
  
  const sortProjects = (a: any, b: any) => {
    const dateA = new Date(a.completionDate || 0).getTime();
    const dateB = new Date(b.completionDate || 0).getTime();
    return dateB - dateA;
  };
  
  featuredProjects.sort(sortProjects);
  completedProjects.sort(sortProjects);
  
  const topProject = featuredProjects[0] || completedProjects[0];
  if (!topProject) return null;
  
  const heroMediaId = topProject.media.hero;
  if (!heroMediaId) return null;
  
  return getMainMediaById(heroMediaId);
}
