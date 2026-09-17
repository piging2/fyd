/**
 * Constitutional Projection Adapter
 * 
 * Reads projection artifacts and transforms them into runtime format.
 * 
 * Constitutional Rule: Adapters may only read projection/*, never canonical media directly.
 * 
 * Reference: CONSTITUTIONAL_GALLERY_RECONCILIATION_REPORT.md
 * - Section: Projection Artifacts
 * - Section: Projection Invariants
 */

const fs = require('fs');
const path = require('path');

const PROJECTION_PATH = path.resolve(__dirname, '../../metadata/projection');

function loadGalleryProjection() {
  const projectionPath = path.join(PROJECTION_PATH, 'galleryProjection.json');
  const content = fs.readFileSync(projectionPath, 'utf-8');
  return JSON.parse(content);
}

function loadHeroProjection() {
  const projectionPath = path.join(PROJECTION_PATH, 'heroProjection.json');
  const content = fs.readFileSync(projectionPath, 'utf-8');
  return JSON.parse(content);
}

function loadServiceProjection() {
  const projectionPath = path.join(PROJECTION_PATH, 'serviceProjection.json');
  const content = fs.readFileSync(projectionPath, 'utf-8');
  return JSON.parse(content);
}

function adaptGalleryProjection(projection) {
  // Transform projection artifact into runtime gallery format
  const gallery = [];
  
  for (const project of projection.projects) {
    // Add representative
    gallery.push({
      filename: project.galleryRepresentative,
      projectId: project.projectId,
      role: 'representative'
    });
    
    // Add supporting evidence
    for (const supporting of project.supportingGalleryEvidence) {
      gallery.push({
        filename: supporting,
        projectId: project.projectId,
        role: 'supporting'
      });
    }
  }
  
  return gallery;
}

function adaptHeroProjection(projection) {
  // Transform projection artifact into runtime hero format
  return {
    filename: projection.hero.filename,
    mediaId: projection.hero.heroMediaId,
    dimensions: projection.hero.dimensions,
    score: projection.hero.score
  };
}

function adaptServiceProjection(projection) {
  // Transform projection artifact into runtime service format
  const services = {};
  
  for (const service of projection.services) {
    services[service.serviceId] = {
      filename: service.servicePreviewMediaId,
      score: service.score
    };
  }
  
  return services;
}

function getGalleryConfig() {
  const projection = loadGalleryProjection();
  const adapted = adaptGalleryProjection(projection);
  
  return {
    gallery: adapted,
    version: projection.projectionVersion,
    generatedAt: projection.generatedAt,
    generatedHash: projection.generatedHash,
    provenance: {
      scoringVersion: projection.scoringVersion,
      canonicalGraphVersion: projection.canonicalGraphVersion,
      generatorVersion: projection.generatorVersion
    }
  };
}

function getHeroConfig() {
  const projection = loadHeroProjection();
  const adapted = adaptHeroProjection(projection);
  
  return {
    hero: adapted,
    version: projection.projectionVersion,
    generatedAt: projection.generatedAt,
    generatedHash: projection.generatedHash,
    provenance: {
      scoringVersion: projection.scoringVersion,
      canonicalGraphVersion: projection.canonicalGraphVersion,
      generatorVersion: projection.generatorVersion
    }
  };
}

function getServiceConfig() {
  const projection = loadServiceProjection();
  const adapted = adaptServiceProjection(projection);
  
  return {
    services: adapted,
    version: projection.projectionVersion,
    generatedAt: projection.generatedAt,
    generatedHash: projection.generatedHash,
    provenance: {
      scoringVersion: projection.scoringVersion,
      canonicalGraphVersion: projection.canonicalGraphVersion,
      generatorVersion: projection.generatorVersion
    }
  };
}

module.exports = {
  getGalleryConfig,
  getHeroConfig,
  getServiceConfig,
  loadGalleryProjection,
  loadHeroProjection,
  loadServiceProjection
};
