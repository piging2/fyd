/**
 * Before/After Authority Types
 * 
 * Before/After photo pairs as a constitutional authority.
 */

export interface BeforeAfterPair {
  id: string;
  service: string;
  beforeMediaId: string;
  afterMediaId: string;
  title?: string;
  description?: string;
}

export interface BeforeAfterManifest {
  version: string;
  generatedAt: string;
  pairs: BeforeAfterPair[];
}
