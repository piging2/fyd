# FYD media quarantine (2026-09-21)

Derivative directories moved OUT of public/fyd-media/ because no
fyd-media@2 manifest references them (verified: digest not present in any
manifest media[].variants[].derivedFrom or media[].digest).

Includes the off-origin Gravatar directory (7eebb88c...): the rights gate
classifies it unclear-reference-only, retained as a source reference only,
never acquired or served.

Reversible: move a directory back to public/fyd-media/<digest>/ to restore.
Do NOT delete: evidence preservation.
