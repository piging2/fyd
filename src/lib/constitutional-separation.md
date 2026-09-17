# Constitutional Separation: Business vs Presentation

## Architecture Principle

The codebase separates **Business Authorities** from **Presentation Authorities** to eliminate architectural confusion.

## Business Authorities

Business authorities describe the business itself — the core data model.

**Location:** `src/config/` (JSON authorities) and `src/lib/` (adapters)

**Authorities:**
- `projects.v1.json` — Canonical business objects
- `services.v1.json` — Service catalog with capabilities
- `cities.v1.json` — Geographic coverage
- `materials.v1.json` — Material catalog
- `reviews.v1.json` — Customer feedback
- `brand.v1.json` — Company branding assets
- `gallery-presets.v1.json` — Gallery configurations

**Future Authorities (to be created):**
- `stories.v1.json` — Project narratives
- `estimate-profiles.v1.json` — Estimate templates
- `warranty-policies.v1.json` — Warranty policies
- `company.v1.json` — Company information
- `estimates.v1.json` — Estimate history

**Adapters:**
- `src/lib/projects.ts` — Project authority adapter
- `src/lib/registries.ts` — Services, cities, materials, gallery presets adapters
- `src/lib/reviews.ts` — Reviews authority adapter
- `src/lib/brand.ts` — Brand authority adapter
- `src/lib/media.ts` — Media authority adapter

## Presentation Authorities

Presentation authorities describe how the business is presented to users.

**Location:** `src/config/` (configuration) and component-level

**Authorities:**
- `navigation.ts` — Site navigation structure
- `seo.ts` — SEO configuration
- `featureFlags.ts` — Feature toggles
- `company.ts` — Company display information
- `faq.ts` — FAQ content
- `beforeAfter.ts` — Before/after gallery configuration

**Future Authorities (to be created):**
- `homepage.v1.json` — Homepage curation
- `hero.v1.json` — Hero rotation
- `routing.v1.json` — Route configuration

## Separation Rules

1. **Business authorities never reference presentation authorities**
2. **Presentation authorities may reference business authorities**
3. **Components consume both, but through adapters**
4. **No business logic in presentation authorities**
5. **No presentation logic in business authorities**

## Migration Path

**Phase 1 (Current):** Document separation
**Phase 2:** Create presentation/ directory structure
**Phase 3:** Move presentation authorities to presentation/
**Phase 4:** Update imports and references
**Phase 5:** Validate separation with lint rules

## Benefits

- Clear architectural boundaries
- Easier testing (business logic isolated from presentation)
- Reusable business authorities across multiple presentations
- Simpler migration to new UI frameworks
- Better separation of concerns
