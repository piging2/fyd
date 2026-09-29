---
applyTo: "src/fyd/sitespec/**,src/fyd/ui/**,src/fyd/components/**,src/app/sites/**,src/app/build/**,src/app/o/**,src/app/embed/**,src/app/fyd/**"
---

# SiteSpec / renderer boundary instructions

SiteSpec is Layer 2 (experience spec). The renderer is Layer 3: a pure
deterministic projection of SiteSpec plus viewer context. These files are
the website, the Circle margin, and the Node expansion surfaces.

## Rules

- The renderer never mutates SiteSpec. Changing renderer implementation
  must not change the spec, and changing the spec must not rewrite
  business truth.
- FydCircle (src/fyd/ui/fyd-circle.tsx) is the only circle primitive. A
  circle is a literal circle at every state: no card, rectangle, or modal
  substitution, at any viewport.
- Margins are graph-driven, never decorative. Composition: the primary
  business Circle plus deterministically ranked related Circles from real
  object relationships. Sparse evidence means fewer Circles, never padding
  with generic cards.
- Circle -> compact preview -> rich Node is one object expanding, not three
  separate pages. Every /o/[objectId] route must resolve a real object;
  unknown objects get honest 404/unknown behavior, never fixture fallback.
- Interaction is never hover-only. Mobile: primary Circle is a floating
  tap target of at least 44px with a related-object tray/sheet; the graph
  experience must survive on small screens.
- Desktop margins are visibly separated from the website content plane.
- Every factual rendered value binds to an OBJECT FIELD, an
  EVIDENCE-BACKED DERIVATION, OWNER AUTHORED COPY, or EXPLICITLY LABELED
  GENERATED PRESENTATION COPY. The binding verifier owns "no invented
  claims" at this boundary.

## Agent output contract

Return: QUESTION / EVIDENCE / FILES INSPECTED / CODE/HISTORY HARVESTED /
EXTERNAL MATERIAL REVIEWED / ASSUMPTIONS FALSIFIED / RECOMMENDATION /
ADOPT / ADAPT / REJECT / TEST COMMAND / RISKS / NEXT HIGHEST-LEVERAGE
ACTION. No architecture essays without evidence.
