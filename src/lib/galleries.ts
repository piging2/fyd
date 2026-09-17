/**
 * Virtual Gallery Engine - Metadata-Based Gallery System
 * 
 * Galleries are virtual, not physical folders.
 * Same photos can appear in multiple galleries based on metadata.
 * 
 * Examples:
 * - Gallery by Service: Service = Fence
 * - Gallery by Location: City = Albany
 * - Gallery by Material: Material = Cedar
 * 
 * The gallery engine uses registries to drive all gallery generation.
 * No manual galleries needed.
 */

import { Project } from "@/types/projects";
import { getAllProjects } from "@/lib/projects";
import { getAllServices, getAllCities, getAllMaterials, getAllGalleryPresets } from "@/lib/registries";
import type { GalleryPreset } from "@/types/registries";

export interface GalleryFilter {
  service?: string;
  services?: string[];
  city?: string;
  county?: string;
  state?: string;
  tags?: string[];
  featured?: boolean;
  heroEligible?: boolean;
  homepageEligible?: boolean;
  status?: string;
  hasBefore?: boolean;
  hasAfter?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}

export interface Gallery {
  id: string;
  name: string;
  description: string;
  projects: Project[];
  count: number;
  filter: GalleryFilter;
}

/**
 * Create a virtual gallery based on metadata filters
 */
export function createGallery(filter: GalleryFilter, id: string, name: string, description: string): Gallery {
  const allProjects = getAllProjects();
  
  let filteredProjects = allProjects.filter(project => {
    // Service filter
    if (filter.service && project.service !== filter.service) return false;
    
    // Multiple services filter
    if (filter.services && filter.services.length > 0) {
      if (!filter.services.includes(project.service)) return false;
    }
    
    // City filter
    if (filter.city && project.location.city.toLowerCase() !== filter.city.toLowerCase()) return false;
    
    // County filter
    if (filter.county && project.location.county.toLowerCase() !== filter.county.toLowerCase()) return false;
    
    // State filter
    if (filter.state && project.location.state.toLowerCase() !== filter.state.toLowerCase()) return false;
    
    // Tags filter (must have ALL specified tags)
    if (filter.tags && filter.tags.length > 0) {
      const hasAllTags = filter.tags.every(tag => 
        project.tags.some(t => t.toLowerCase() === tag.toLowerCase())
      );
      if (!hasAllTags) return false;
    }
    
    // Featured filter
    if (filter.featured !== undefined && project.featured !== filter.featured) return false;
    
    // Hero eligible filter
    if (filter.heroEligible !== undefined && project.heroEligible !== filter.heroEligible) return false;
    
    // Homepage eligible filter
    if (filter.homepageEligible !== undefined && project.homepageEligible !== filter.homepageEligible) return false;
    
    // Status filter
    if (filter.status && project.status !== filter.status) return false;
    
    // Before/After filter
    if (filter.hasBefore && !project.media.before) return false;
    if (filter.hasAfter && !project.media.after) return false;
    
    return true;
  });
  
  // Sort
  if (filter.sortBy) {
    const sortOrder = filter.sortOrder || "asc";
    filteredProjects = [...filteredProjects].sort((a, b) => {
      let comparison = 0;
      
      if (filter.sortBy === "completionDate") {
        const aDate = a.completionDate ? new Date(a.completionDate).getTime() : 0;
        const bDate = b.completionDate ? new Date(b.completionDate).getTime() : 0;
        comparison = aDate - bDate;
      } else if (filter.sortBy === "title") {
        comparison = a.title.localeCompare(b.title);
      } else if (filter.sortBy === "featuredWeight") {
        // This would need to be added to project schema, using featured as fallback
        comparison = (a.featured ? 1 : 0) - (b.featured ? 1 : 0);
      }
      
      return sortOrder === "desc" ? -comparison : comparison;
    });
  }
  
  // Limit
  if (filter.limit) {
    filteredProjects = filteredProjects.slice(0, filter.limit);
  }
  
  return {
    id,
    name,
    description,
    projects: filteredProjects,
    count: filteredProjects.length,
    filter,
  };
}

/**
 * Get gallery by service (from registry)
 */
export function getServiceGallery(serviceId: string): Gallery {
  const service = getAllServices().find(s => s.id === serviceId);
  if (!service) {
    return createGallery(
      { service: serviceId },
      `service-${serviceId}`,
      serviceId,
      `Projects for ${serviceId}`
    );
  }
  
  // Special case: for painting service, also include exterior-painting projects
  let filter: GalleryFilter = { service: serviceId };
  if (serviceId === 'painting') {
    filter = { services: ['painting', 'exterior-painting'] };
  }
  
  return createGallery(
    filter,
    `service-${serviceId}`,
    service.name,
    service.description
  );
}

/**
 * Get gallery by city (from registry)
 */
export function getCityGallery(cityId: string): Gallery {
  const city = getAllCities().find(c => c.id === cityId);
  if (!city) {
    return createGallery(
      { city: cityId },
      `city-${cityId}`,
      cityId,
      `Projects in ${cityId}`
    );
  }
  
  return createGallery(
    { city: cityId },
    `city-${cityId}`,
    city.name,
    `Projects in ${city.name}, ${city.state}`
  );
}

/**
 * Get gallery by material (from registry)
 */
export function getMaterialGallery(materialId: string): Gallery {
  const material = getAllMaterials().find(m => m.id === materialId);
  if (!material) {
    return createGallery(
      { tags: [materialId] },
      `material-${materialId}`,
      materialId,
      `Projects featuring ${materialId}`
    );
  }
  
  return createGallery(
    { tags: [materialId] },
    `material-${materialId}`,
    material.name,
    material.description
  );
}

/**
 * Get gallery from preset (from registry)
 */
export function getPresetGallery(presetId: string): Gallery {
  const preset = getAllGalleryPresets().find(p => p.id === presetId);
  if (!preset) {
    return createGallery(
      {},
      `preset-${presetId}`,
      presetId,
      `Gallery preset: ${presetId}`
    );
  }
  
  const filter: GalleryFilter = {};
  
  if (preset.filter.hasBefore) filter.hasBefore = true;
  if (preset.filter.hasAfter) filter.hasAfter = true;
  if (preset.filter.featured) filter.featured = true;
  if (preset.filter.services) filter.services = preset.filter.services;
  if (preset.filter.tags) filter.tags = preset.filter.tags;
  if (preset.filter.status) filter.status = preset.filter.status;
  if (preset.filter.sortBy) filter.sortBy = preset.filter.sortBy;
  if (preset.filter.sortOrder) filter.sortOrder = preset.filter.sortOrder;
  if (preset.filter.limit) filter.limit = preset.filter.limit;
  
  return createGallery(
    filter,
    `preset-${presetId}`,
    preset.name,
    preset.description
  );
}

/**
 * Get featured gallery
 */
export function getFeaturedGallery(): Gallery {
  return createGallery(
    { featured: true },
    "featured",
    "Featured Projects",
    "Our most notable and featured work"
  );
}

/**
 * Get hero-eligible gallery
 */
export function getHeroEligibleGallery(): Gallery {
  return createGallery(
    { heroEligible: true },
    "hero-eligible",
    "Hero Projects",
    "Projects eligible for hero placement"
  );
}

/**
 * Get homepage-eligible gallery
 */
export function getHomepageEligibleGallery(): Gallery {
  return createGallery(
    { homepageEligible: true },
    "homepage-eligible",
    "Homepage Projects",
    "Projects eligible for homepage display"
  );
}

/**
 * Get completed projects gallery
 */
export function getCompletedGallery(): Gallery {
  return createGallery(
    { status: "completed" },
    "completed",
    "Completed Projects",
    "All completed projects"
  );
}

/**
 * Get before/after gallery
 */
export function getBeforeAfterGallery(): Gallery {
  return createGallery(
    { hasBefore: true, hasAfter: true },
    "before-after",
    "Before / After",
    "Projects with before and after photos"
  );
}

/**
 * Get all available service galleries (from registry)
 */
export function getAllServiceGalleries(): Gallery[] {
  const services = getAllServices();
  return services.map(service => getServiceGallery(service.id));
}

/**
 * Get all available city galleries (from registry)
 */
export function getAllCityGalleries(): Gallery[] {
  const cities = getAllCities();
  return cities.map(city => getCityGallery(city.id));
}

/**
 * Get all available material galleries (from registry)
 */
export function getAllMaterialGalleries(): Gallery[] {
  const materials = getAllMaterials();
  return materials.map(material => getMaterialGallery(material.id));
}

/**
 * Get all preset galleries (from registry)
 */
export function getAllPresetGalleries(): Gallery[] {
  const presets = getAllGalleryPresets();
  return presets.map(preset => getPresetGallery(preset.id));
}

/**
 * Get gallery statistics
 */
export function getGalleryStats() {
  const serviceGalleries = getAllServiceGalleries();
  const cityGalleries = getAllCityGalleries();
  const materialGalleries = getAllMaterialGalleries();
  const presetGalleries = getAllPresetGalleries();
  
  return {
    totalServiceGalleries: serviceGalleries.length,
    totalCityGalleries: cityGalleries.length,
    totalMaterialGalleries: materialGalleries.length,
    totalPresetGalleries: presetGalleries.length,
    serviceGalleries: serviceGalleries.map(g => ({
      id: g.id,
      name: g.name,
      count: g.count,
    })),
    cityGalleries: cityGalleries.map(g => ({
      id: g.id,
      name: g.name,
      count: g.count,
    })),
    materialGalleries: materialGalleries.map(g => ({
      id: g.id,
      name: g.name,
      count: g.count,
    })),
    presetGalleries: presetGalleries.map(g => ({
      id: g.id,
      name: g.name,
      count: g.count,
    })),
  };
}
