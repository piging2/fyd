/**
 * Registry Authority - Data-Driven Configuration
 * 
 * Services, cities, materials, and gallery presets are data-driven.
 * Adding a new service like "ADUs" or "Pole Barns" becomes a data change rather than a code change.
 */

import type { Service, ServicesRegistry, City, CitiesRegistry, Material, MaterialsRegistry, GalleryPreset, GalleryPresetsRegistry } from "@/types/registries";
import { loadAuthority, clearAuthorityCache, sortByOrder, findById, findBySlug, filterFeatured, filterHomepageEligible, filterNonArchived } from "./authority-loader";

// Load registries using shared AuthorityLoader
export function loadServicesRegistry(): ServicesRegistry {
  return loadAuthority<ServicesRegistry>({
    path: "@/config/services.v1.json",
    fallback: { version: "1.0.0", generatedAt: new Date().toISOString(), services: [] },
    name: "Services"
  });
}

export function loadCitiesRegistry(): CitiesRegistry {
  return loadAuthority<CitiesRegistry>({
    path: "@/config/cities.v1.json",
    fallback: { version: "1.0.0", generatedAt: new Date().toISOString(), cities: [] },
    name: "Cities"
  });
}

export function loadMaterialsRegistry(): MaterialsRegistry {
  return loadAuthority<MaterialsRegistry>({
    path: "@/config/materials.v1.json",
    fallback: { version: "1.0.0", generatedAt: new Date().toISOString(), materials: [] },
    name: "Materials"
  });
}

export function loadGalleryPresetsRegistry(): GalleryPresetsRegistry {
  return loadAuthority<GalleryPresetsRegistry>({
    path: "@/config/gallery-presets.v1.json",
    fallback: { version: "1.0.0", generatedAt: new Date().toISOString(), presets: [] },
    name: "Gallery Presets"
  });
}

/**
 * Get all services
 */
export function getAllServices(): Service[] {
  const registry = loadServicesRegistry();
  console.log('[FORENSIC] SERVER SERVICES AUTHORITY READ', {
    serviceCount: registry.services.length,
    services: registry.services.map(s => ({
      slug: s.slug,
      cardMediaId: s.cardMediaId,
    })),
  });
  return sortByOrder(registry.services);
}

/**
 * Get all services with runtime assignments applied
 * P0 FIX: Assignments are runtime-only - static files are projections for backup/audit
 * Static fallback removed to prevent authority inversion and resurrection
 */
export async function getAllServicesWithAssignments(): Promise<Service[]> {
  const services = getAllServices();

  try {
    const { getServiceCardAssignment } = await import('@/lib/assignment-store');

    // Apply runtime assignments to each service (runtime-only authority)
    const servicesWithAssignments = await Promise.all(
      services.map(async (service) => {
        const assignment = await getServiceCardAssignment(service.slug);
        
        // Runtime assignment is the ONLY authority - no static fallback
        if (assignment) {
          // P0 FIX: Verify runtime assignment passes public media gate
          const { resolvePublicMedia } = await import('@/lib/media');
          const resolvedMedia = await resolvePublicMedia(assignment.mediaId);

          if (resolvedMedia) {
            console.log('[REGISTRY] RUNTIME_ASSIGNMENT_APPROVED', {
              serviceSlug: service.slug,
              mediaId: assignment.mediaId
            });
            return {
              ...service,
              cardMediaId: assignment.mediaId,
            };
          } else {
            console.error('[PUBLIC_MEDIA_GATE] RUNTIME_ASSIGNMENT_REJECTED', {
              serviceSlug: service.slug,
              mediaId: assignment.mediaId
            });
            // P0 FIX: FAIL CLOSED - no static fallback to prevent authority bypass
            return service; // Return service without cardMediaId (no image)
          }
        }

        // P0 FIX: No static fallback - return service without cardMediaId if no runtime assignment
        return service;
      })
    );

    return sortByOrder(servicesWithAssignments);
  } catch (error) {
    // P0 FIX: Assignment store failure - FAIL CLOSED, no static fallback
    console.error('[REGISTRY] ASSIGNMENT_STORE_FAILED - FAILING CLOSED', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Return services without cardMediaId (no authority bypass)
    const servicesWithoutAssignments = services.map(service => ({
      ...service,
      cardMediaId: null // Remove any static assignment to prevent authority bypass
    }));
    
    return sortByOrder(servicesWithoutAssignments);
  }
}

/**
 * Get service by ID
 */
export function getServiceById(id: string): Service | null {
  const services = getAllServices();
  return findById(services, id);
}

/**
 * Get service by slug
 */
export function getServiceBySlug(slug: string): Service | null {
  const services = getAllServices();
  return findBySlug(services, slug);
}

/**
 * Get featured services
 */
export function getFeaturedServices(): Service[] {
  const services = getAllServices();
  return filterFeatured(services);
}

/**
 * Get homepage-eligible services
 */
export function getHomepageEligibleServices(): Service[] {
  const services = getAllServices();
  return filterHomepageEligible(services);
}

/**
 * Get non-archived services
 */
export function getNonArchivedServices(): Service[] {
  const services = getAllServices();
  const nonArchived = filterNonArchived(services);
  console.log('[FORENSIC] SERVER NON_ARCHIVED SERVICES', {
    total: services.length,
    nonArchived: nonArchived.length,
    services: nonArchived.map(s => ({
      slug: s.slug,
      cardMediaId: s.cardMediaId,
    })),
  });
  return nonArchived;
}

/**
 * Get all cities
 */
export function getAllCities(): City[] {
  const registry = loadCitiesRegistry();
  return sortByOrder(registry.cities);
}

/**
 * Get city by ID
 */
export function getCityById(id: string): City | null {
  const cities = getAllCities();
  return findById(cities, id);
}

/**
 * Get cities by county
 */
export function getCitiesByCounty(county: string): City[] {
  const cities = getAllCities();
  return cities.filter((city: City) => city.county === county);
}

/**
 * Get featured cities
 */
export function getFeaturedCities(): City[] {
  const cities = getAllCities();
  return filterFeatured(cities);
}

/**
 * Get homepage-eligible cities
 */
export function getHomepageEligibleCities(): City[] {
  const cities = getAllCities();
  return filterHomepageEligible(cities);
}

/**
 * Get all materials
 */
export function getAllMaterials(): Material[] {
  const registry = loadMaterialsRegistry();
  return sortByOrder(registry.materials);
}

/**
 * Get material by ID
 */
export function getMaterialById(id: string): Material | null {
  const materials = getAllMaterials();
  return findById(materials, id);
}

/**
 * Get featured materials
 */
export function getFeaturedMaterials(): Material[] {
  const materials = getAllMaterials();
  return filterFeatured(materials);
}

/**
 * Get all gallery presets
 */
export function getAllGalleryPresets(): GalleryPreset[] {
  const registry = loadGalleryPresetsRegistry();
  return sortByOrder(registry.presets);
}

/**
 * Get gallery preset by ID
 */
export function getGalleryPresetById(id: string): GalleryPreset | null {
  const presets = getAllGalleryPresets();
  return findById(presets, id);
}

/**
 * Get featured gallery presets
 */
export function getFeaturedGalleryPresets(): GalleryPreset[] {
  const presets = getAllGalleryPresets();
  return filterFeatured(presets);
}

/**
 * Clear cache (useful for testing or hot reload)
 */
export function clearRegistriesCache(): void {
  clearAuthorityCache("@/config/services.v1.json");
  clearAuthorityCache("@/config/cities.v1.json");
  clearAuthorityCache("@/config/materials.v1.json");
  clearAuthorityCache("@/config/gallery-presets.v1.json");
}
