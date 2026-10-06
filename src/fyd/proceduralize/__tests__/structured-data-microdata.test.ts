/**
 * Q9 failing-test fixture for the extruct candidate (writer gate, question 9).
 *
 * INTENDED REPO PATH (not yet placed; research space only):
 *   src/fyd/proceduralize/__tests__/structured-data-microdata.test.ts
 *   with the fixture at:
 *   src/fyd/proceduralize/__tests__/amicomechanical-microdata.html
 *
 * Runner: jest 29 + ts-jest (per FYD lane test runs from /home/nolan/projects/ping;
 * colocated __tests__ dirs, describe/test/expect).
 *
 * Checkout keyed to: branch fyd/sprint-integration-2026-09-24 @ c93a7ced (2026-09-26
 * verified state; Pig unreachable 2026-09-27, so re-verify checkout before placing).
 *
 * What the current implementation does (verified 2026-09-26, researcher + falsifier):
 *   src/fyd/proceduralize/structured-data.ts (670 LOC): discoverStructuredData
 *   (line 74) extracts exclusively <script type="application/ld+json"> blocks via
 *   regex. No microdata / RDFa / itemscope parsing exists anywhere in the file.
 *   The fixture carries zero ld+json blocks, so the current stage yields zero
 *   records and the first assertion below fails with received length 0.
 *
 * What a minimal patch must add: a TS microdata itemscope/itemprop parser that
 * emits the LocalBusiness record into the stage output, type-filtered to the
 * schema.org types the OBJECT stage consumes (not a blind multi-syntax dump;
 * see FAILURE-MODE.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverStructuredData } from '../structured-data';

const FIXTURE = join(__dirname, 'amicomechanical-microdata.html');

// Shape-tolerant record finder: the stage's exact output record shape is the
// writer's normalization choice. Whatever shape the writer picks, the record
// must carry a schema.org type name, so we search recursively for objects
// whose type marker mentions LocalBusiness. This keeps the test honest about
// WHAT must appear without guessing the exact seam signature.
function findTypedRecords(value: unknown, typeName: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node !== null && typeof node === 'object') {
      const rec = node as Record<string, unknown>;
      const typeMarkers = ['@type', 'type', 'itemtype', 'schemaType'];
      for (const key of typeMarkers) {
        const t = rec[key];
        const names = Array.isArray(t) ? t : [t];
        if (names.some((n) => typeof n === 'string' && n.includes(typeName))) {
          found.push(rec);
          break;
        }
      }
      Object.values(rec).forEach(visit);
    }
  };
  visit(value);
  return found;
}

describe('structured-data stage: multi-syntax extraction (microdata)', () => {
  test('yields the typed LocalBusiness record from the amicomechanical fixture', () => {
    const html = readFileSync(FIXTURE, 'utf8');

    // Current implementation: JSON-LD-only regex extraction.
    const result = discoverStructuredData(html);

    const businesses = findTypedRecords(result, 'LocalBusiness');

    // FAILS BEFORE: the fixture has zero ld+json blocks, so the current stage
    // yields zero records. Received: 0. Expected: 1.
    expect(businesses).toHaveLength(1);

    // PASSES AFTER the minimal microdata patch: the typed record carries the
    // six facts the OBJECT stage needs without NLP-parsing marketing prose.
    const recordText = JSON.stringify(businesses[0]);
    for (const expected of [
      'Amico Plumbing & Mechanical Inc.',
      '595 N. Westgate Drive',
      'Grand Junction',
      'Colorado',
      '81505',
      '970-241-6258',
    ]) {
      expect(recordText).toContain(expected);
    }
  });
});
