# Ask FYD Context-Projection Boundary (FYD-010)

Canonical objects are NEVER model input directly. Every Ask FYD model
context is built by exactly one choke point:

  CANONICAL CONTEXT -> VIEWER + VISIBILITY + CAPABILITY
    -> projectAskContextForViewer (src/fyd/ask/context-projection.ts)
    -> buildAskFydContext -> ASK FYD

The projection is deterministic and fail-closed:

1. classifyAskViewer: "owner" requires verified === true AND a non-empty
   id. Anonymous, unknown, demo, practice, and unverified ids are
   "visitor". Mode strings, query params, and demo constructs can never
   produce the owner class.
2. The model pipeline is identical for every viewer class: owner
   visibility decisions (hide drops, address-likes coarsen), FYD-Q2 hide
   traversal cut, FYD-Q1 conflict suppression, public objects only, the
   visitor-safe field allowlist on every object, active relationships with
   surviving endpoints. Unknown field names are dropped, never passed.
3. The model is never an owner: private values are excluded from model
   context for EVERY viewer class, including verified owners. Owners read
   private data through owner surfaces, never through the model.

Prompt instructions are not privacy controls. Nothing in the system
prompt tells the model to withhold fields; fields it must not see are
absent from its context by construction.

demoOwnerContext is excluded from real authorization: the Ask pipeline
never consults demo identity, and a demo viewer classifies as visitor.
Demo owner mode remains only on its explicitly demo-gated route.
