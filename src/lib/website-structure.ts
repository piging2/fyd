/**
 * Website Structure Mapper - Route → Page → Component → Section → Slot Hierarchy
 * 
 * Purpose: Map the actual website structure for Workbench preview
 * - Shows which page I'm looking at
 * - Shows which section I'm looking at
 * - Shows which visual slot is being represented
 * - Shows what media currently occupies that slot
 * 
 * Architecture:
 * - Derived from actual Next.js routing structure
 * - Semantically mapped from component analysis
 * - Foundation for drag-and-drop targeting
 */

export interface WebsitePage {
  route: string;
  title: string;
  sections: WebsiteSection[];
}

export interface WebsiteSection {
  id: string;
  name: string;
  component: string;
  visualSlots: VisualSlotRef[];
}

export interface VisualSlotRef {
  id: string;
  name: string;
  currentMediaId: string | null;
  currentMediaFilename: string | null;
  status: 'OCCUPIED' | 'EMPTY' | 'BROKEN' | 'RECOVERABLE' | 'DYNAMIC';
  acceptDrop: boolean;
  allowedAssetTypes: string[];
}

// Complete website structure from semantic analysis
export const WEBSITE_STRUCTURE: WebsitePage[] = [
  {
    route: '/',
    title: 'Homepage',
    sections: [
      {
        id: 'hero',
        name: 'Hero Section',
        component: 'HeroSection',
        visualSlots: [
          {
            id: 'homepage-hero-slot',
            name: 'Hero Background',
            currentMediaId: 'homepage-hero-canonical',
            currentMediaFilename: 'hero-background-enhanced.jpg',
            status: 'OCCUPIED',
            acceptDrop: true,
            allowedAssetTypes: ['hero', 'brand'],
          },
          {
            id: 'homepage-owner-portrait-slot',
            name: 'Owner Portrait',
            currentMediaId: 'brand-portrait',
            currentMediaFilename: 'portrait.jpeg',
            status: 'BROKEN',
            acceptDrop: true,
            allowedAssetTypes: ['portrait', 'brand'],
          },
        ],
      },
      {
        id: 'trust-strip',
        name: 'Trust Strip',
        component: 'TrustStrip',
        visualSlots: [],
      },
      {
        id: 'services',
        name: 'Services Section',
        component: 'ServiceCard',
        visualSlots: [
          {
            id: 'homepage-service-card-slot-fences',
            name: 'Fences Service Card',
            currentMediaId: null,
            currentMediaFilename: null,
            status: 'EMPTY',
            acceptDrop: true,
            allowedAssetTypes: ['hero', 'gallery'],
          },
          {
            id: 'homepage-service-card-slot-painting',
            name: 'Painting Service Card',
            currentMediaId: null,
            currentMediaFilename: null,
            status: 'EMPTY',
            acceptDrop: true,
            allowedAssetTypes: ['hero', 'gallery'],
          },
        ],
      },
      {
        id: 'featured-transformation',
        name: 'Featured Transformation',
        component: 'BeforeAfterSlider',
        visualSlots: [
          {
            id: 'homepage-featured-transformation-before-slot',
            name: 'Before Image',
            currentMediaId: null,
            currentMediaFilename: 'IMG_0555.JPG',
            status: 'RECOVERABLE',
            acceptDrop: true,
            allowedAssetTypes: ['before', 'gallery'],
          },
          {
            id: 'homepage-featured-transformation-after-slot',
            name: 'After Image',
            currentMediaId: null,
            currentMediaFilename: 'IMG_0535.JPG',
            status: 'RECOVERABLE',
            acceptDrop: true,
            allowedAssetTypes: ['after', 'hero'],
          },
        ],
      },
    ],
  },
  {
    route: '/about',
    title: 'About',
    sections: [
      {
        id: 'hero',
        name: 'Hero Section',
        component: 'HeroSection',
        visualSlots: [
          {
            id: 'about-hero-slot',
            name: 'Owner Portrait',
            currentMediaId: 'brand-portrait',
            currentMediaFilename: 'portrait.jpeg',
            status: 'BROKEN',
            acceptDrop: true,
            allowedAssetTypes: ['portrait', 'brand'],
          },
        ],
      },
      {
        id: 'service-area',
        name: 'Service Area',
        component: 'CityGrid',
        visualSlots: [],
      },
    ],
  },
  {
    route: '/our-work',
    title: 'Our Work',
    sections: [
      {
        id: 'hero',
        name: 'Hero Section',
        component: 'HeroSection',
        visualSlots: [],
      },
      {
        id: 'featured-transformations',
        name: 'Featured Transformations',
        component: 'BeforeAfterSlider',
        visualSlots: [],
      },
      {
        id: 'recent-projects',
        name: 'Recent Projects',
        component: 'ProjectCard',
        visualSlots: [
          {
            id: 'our-work-project-card',
            name: 'Project Card Slot',
            currentMediaId: null,
            currentMediaFilename: null,
            status: 'DYNAMIC',
            acceptDrop: true,
            allowedAssetTypes: ['hero', 'gallery'],
          },
        ],
      },
      {
        id: 'project-gallery',
        name: 'Project Gallery',
        component: 'GalleryPhoto',
        visualSlots: [
          {
            id: 'our-work-gallery',
            name: 'Gallery Photo Slot',
            currentMediaId: null,
            currentMediaFilename: null,
            status: 'DYNAMIC',
            acceptDrop: true,
            allowedAssetTypes: ['gallery', 'hero'],
          },
        ],
      },
    ],
  },
  {
    route: '/services',
    title: 'Services',
    sections: [
      {
        id: 'hero',
        name: 'Hero Section',
        component: 'SectionHeading',
        visualSlots: [],
      },
      {
        id: 'service-cards',
        name: 'Service Cards',
        component: 'ServiceCard',
        visualSlots: [],
      },
      {
        id: 'featured-project',
        name: 'Featured Project',
        component: 'BeforeAfterSlider',
        visualSlots: [],
      },
      {
        id: 'project-gallery',
        name: 'Project Gallery',
        component: 'ProjectHero',
        visualSlots: [],
      },
    ],
  },
  {
    route: '/projects/[slug]',
    title: 'Project Detail',
    sections: [
      {
        id: 'hero',
        name: 'Project Hero',
        component: 'ProjectSpotlight',
        visualSlots: [
          {
            id: 'project-hero-slot-fences',
            name: 'Fence Project Hero',
            currentMediaId: 'b8adf93d-6a2e-5738-9dbf-aa2350f01d55',
            currentMediaFilename: 'FENCE BUILD.jpg',
            status: 'OCCUPIED',
            acceptDrop: true,
            allowedAssetTypes: ['hero'],
          },
          {
            id: 'project-hero-slot-builtins',
            name: 'Built-ins Project Hero',
            currentMediaId: '0a70fd32-d9f2-5aea-bd86-25437d39a7ad',
            currentMediaFilename: 'FINISHEDCARPENTRY.png',
            status: 'OCCUPIED',
            acceptDrop: true,
            allowedAssetTypes: ['hero'],
          },
          {
            id: 'project-hero-slot-repairs',
            name: 'Repairs Project Hero',
            currentMediaId: '898839ee-b2cf-5507-a862-6e27ecae71f4',
            currentMediaFilename: 'TRIMREPAIR.png',
            status: 'OCCUPIED',
            acceptDrop: true,
            allowedAssetTypes: ['hero'],
          },
          {
            id: 'project-hero-slot-painting',
            name: 'Painting Project Hero',
            currentMediaId: null,
            currentMediaFilename: 'IMG_0535.JPG',
            status: 'RECOVERABLE',
            acceptDrop: true,
            allowedAssetTypes: ['hero'],
          },
        ],
      },
      {
        id: 'before-after',
        name: 'Before/After',
        component: 'BeforeAfterSlider',
        visualSlots: [],
      },
      {
        id: 'gallery',
        name: 'Gallery',
        component: 'ProjectPhotos',
        visualSlots: [],
      },
    ],
  },
  {
    route: '/services/[slug]',
    title: 'Service Detail',
    sections: [
      {
        id: 'hero',
        name: 'Hero Section',
        component: 'SectionHeading',
        visualSlots: [],
      },
      {
        id: 'featured-project',
        name: 'Featured Project',
        component: 'BeforeAfterSlider',
        visualSlots: [],
      },
      {
        id: 'project-gallery',
        name: 'Project Gallery',
        component: 'ProjectHero',
        visualSlots: [],
      },
    ],
  },
];

/**
 * Get website structure
 */
export function getWebsiteStructure(): WebsitePage[] {
  return WEBSITE_STRUCTURE;
}

/**
 * Get page by route
 */
export function getPageByRoute(route: string): WebsitePage | null {
  // Handle dynamic routes
  if (route.startsWith('/projects/')) {
    return WEBSITE_STRUCTURE.find(p => p.route === '/projects/[slug]') || null;
  }
  if (route.startsWith('/services/')) {
    return WEBSITE_STRUCTURE.find(p => p.route === '/services/[slug]') || null;
  }
  
  return WEBSITE_STRUCTURE.find(p => p.route === route) || null;
}

/**
 * Get all empty slots
 */
export function getAllEmptySlots(): VisualSlotRef[] {
  const emptySlots: VisualSlotRef[] = [];
  
  WEBSITE_STRUCTURE.forEach(page => {
    page.sections.forEach(section => {
      section.visualSlots.forEach(slot => {
        if (slot.status === 'EMPTY' || slot.status === 'BROKEN' || slot.status === 'RECOVERABLE' || slot.status === 'DYNAMIC') {
          emptySlots.push(slot);
        }
      });
    });
  });
  
  return emptySlots;
}

/**
 * Get slot by ID
 */
export function getSlotById(slotId: string): VisualSlotRef | null {
  for (const page of WEBSITE_STRUCTURE) {
    for (const section of page.sections) {
      const slot = section.visualSlots.find(s => s.id === slotId);
      if (slot) return slot;
    }
  }
  return null;
}
