/**
 * Storage service — interface only (Directive 031).
 * Today: mock. Tomorrow: Google Drive / S3 / Cloudinary behind this boundary.
 * Implementations are SERVER-ONLY. The browser never calls a storage provider.
 */
export interface StoredAsset {
  id: string;
  name: string;
  url: string;
  provider: "mock" | "google-drive";
}

export interface StorageService {
  store(input: { filename: string; bytes: Buffer; mime: string; folder?: string }): Promise<StoredAsset>;
}

export const mockStorageService: StorageService = {
  async store({ filename }) {
    return { id: `mock_${Date.now()}`, name: filename, url: `mock://${filename}`, provider: "mock" };
  },
};
