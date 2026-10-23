# overlay-empty fixture

Intentionally contains no `fyd-projections/fyd-overlay-snapshot.json`.
The overlay snapshot tests chdir here to prove the reader stays
fail-closed when no snapshot exists at the default bundled path.
