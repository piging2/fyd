// JUSTIFICATION (Priority 8 — Data Adapter Layer):
// No existing ProjectProvider interface in repo (searched src/services/* + src/lib/*).
// UI consumes this interface; backend later replaces mock impl with a PING /business adapter.
// No business logic — returns data only. Satisfies "UI should not know where data comes from."
import type { Project } from "@/types/projects";

export interface ProjectProvider {
  getProject(slug: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
}

// Mock implementation — replaced by PING adapter later. UI never changes.
export const mockProjectProvider: ProjectProvider = {
  async getProject(slug: string) {
    const { getProjectBySlug } = await import("@/lib/projects");
    return getProjectBySlug(slug);
  },
  async listProjects() {
    const { getAllProjects } = await import("@/lib/projects");
    return getAllProjects();
  },
};
