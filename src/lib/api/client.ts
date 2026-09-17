/**
 * API Client - Backend communication layer
 * 
 * Provides type-safe API calls to the PING backend.
 * Designed for scalable connector integration.
 */

class ApiClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string = '/api', apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Singleton instance
export const apiClient = new ApiClient();

// Connector API
export const connectorApi = {
  async getAll() {
    return apiClient.get<ConnectorData[]>('/connectors');
  },

  async getById(id: string) {
    return apiClient.get<ConnectorData>(`/connectors/${id}`);
  },

  async getHealth(id: string) {
    return apiClient.get<ConnectorHealth>(`/connectors/${id}/health`);
  },

  async getCapabilities(id: string) {
    return apiClient.get<ConnectorCapabilities>(`/connectors/${id}/capabilities`);
  },

  async getSchema(id: string) {
    return apiClient.get<ConnectorSchema>(`/connectors/${id}/schema`);
  },

  async getResources(id: string) {
    return apiClient.get<ConnectorResources>(`/connectors/${id}/resources`);
  },

  async getActivity(id: string) {
    return apiClient.get<ConnectorActivity[]>(`/connectors/${id}/activity`);
  },

  async sync(id: string) {
    return apiClient.post<{ success: boolean }>(`/connectors/${id}/sync`, {});
  },

  async testConnection(id: string) {
    return apiClient.post<{ success: boolean; message: string }>(`/connectors/${id}/test`, {});
  },
};

// Projection API
// NOTE: For Happy Place Carpentry, projections are static media records
// This is a minimal implementation returning the actual media authority
export const projectionApi = {
  async getAll() {
    return apiClient.get<ProjectionData[]>('/projections');
  },

  async getById(id: string) {
    return apiClient.get<ProjectionData>(`/projections/${id}`);
  },

  async getByType(type: string) {
    return apiClient.get<ProjectionData[]>(`/projections?type=${type}`);
  },
};

// Timeline API
export const timelineApi = {
  async getEvents(filters?: TimelineFilters) {
    const params = new URLSearchParams(filters as any).toString();
    return apiClient.get<TimelineEvent[]>(`/timeline${params ? `?${params}` : ''}`);
  },

  async getEventById(id: string) {
    return apiClient.get<TimelineEvent>(`/timeline/${id}`);
  },
};

// Evidence API
export const evidenceApi = {
  async getAll() {
    return apiClient.get<EvidencePackage[]>('/evidence');
  },

  async getById(id: string) {
    return apiClient.get<EvidencePackage>(`/evidence/${id}`);
  },
};

// Recommendation API
export const recommendationApi = {
  async getAll() {
    return apiClient.get<Recommendation[]>('/recommendations');
  },

  async getById(id: string) {
    return apiClient.get<Recommendation>(`/recommendations/${id}`);
  },

  async approve(id: string) {
    return apiClient.post<{ success: boolean; executionPlanId: string }>(`/recommendations/${id}/approve`, {});
  },

  async reject(id: string, reason?: string) {
    return apiClient.post<{ success: boolean }>(`/recommendations/${id}/reject`, { reason });
  },

  async modify(id: string, modifications: any) {
    return apiClient.post<{ success: boolean; executionPlanId: string }>(`/recommendations/${id}/modify`, modifications);
  },
};

// Execution API
export const executionApi = {
  async getAll() {
    return apiClient.get<ExecutionPlan[]>('/executions');
  },

  async getById(id: string) {
    return apiClient.get<ExecutionPlan>(`/executions/${id}`);
  },

  async getByStatus(status: string) {
    return apiClient.get<ExecutionPlan[]>(`/executions?status=${status}`);
  },

  async rollback(id: string) {
    return apiClient.post<{ success: boolean }>(`/executions/${id}/rollback`, {});
  },
};

// Replay API
export const replayApi = {
  async getAvailableDates() {
    return apiClient.get<string[]>('/replay/dates');
  },

  async replayToDate(date: string) {
    return apiClient.post<ReplayResult>('/replay', { date });
  },

  async compareProjections(date: string) {
    return apiClient.get<ProjectionComparison>(`/replay/compare?date=${date}`);
  },
};

// Graph API
export const graphApi = {
  async getGraph() {
    return apiClient.get<GraphData>('/graph');
  },

  async getNodeDetails(id: string) {
    return apiClient.get<GraphNode>(`/graph/node/${id}`);
  },

  async getPath(fromId: string, toId: string) {
    return apiClient.get<GraphPath>(`/graph/path?from=${fromId}&to=${toId}`);
  },
};

// Types
export interface ConnectorData {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive' | 'error';
  health: 'healthy' | 'degraded' | 'unhealthy';
  lastSync: string;
  capabilities: string[];
  resources: number;
}

export interface ConnectorHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  lastCheck: string;
  metrics: {
    requests: number;
    errors: number;
    latency: number;
    uptime: number;
  };
}

export interface ConnectorCapabilities {
  readable: boolean;
  writable: boolean;
  queryable: boolean;
  discoverable: boolean;
  observable: boolean;
  transformable: boolean;
  webhookable: boolean;
}

export interface ConnectorSchema {
  resources: ResourceSchema[];
  version: string;
}

export interface ResourceSchema {
  name: string;
  fields: FieldSchema[];
  operations: string[];
}

export interface FieldSchema {
  name: string;
  type: string;
  required: boolean;
  readonly?: boolean;
}

export interface ConnectorResources {
  resources: Array<{
    id: string;
    name: string;
    type: string;
    lastUpdated: string;
  }>;
}

export interface ConnectorActivity {
  type: string;
  timestamp: string;
  status: 'success' | 'failed';
  details?: any;
}

export interface ProjectionData {
  id: string;
  type: string;
  name: string;
  status: string;
  health: string;
  lastActivity: string;
  summary: Record<string, any>;
}

export interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  entity: string;
  entityId: string;
  status: string;
  description: string;
}

export interface TimelineFilters {
  entity?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

export interface EvidencePackage {
  id: string;
  observationId: string;
  confidence: number;
  generatedAt: string;
  sources: {
    knowledge: any;
    vector: any;
    graph: any;
    llm: any;
  };
}

export interface Recommendation {
  id: string;
  action: string;
  confidence: number;
  reasoning: string;
  evidenceId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface ExecutionPlan {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'rolled-back';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  rolledBackAt?: string;
  recommendationId: string;
  error?: string;
  steps: ExecutionStep[];
}

export interface ExecutionStep {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  completedAt?: string;
  startedAt?: string;
  error?: string;
}

export interface ReplayResult {
  eventsProcessed: number;
  projectionsRebuilt: number;
  differencesFound: number;
  comparisons: ProjectionComparison[];
}

export interface ProjectionComparison {
  projectionId: string;
  projectionName: string;
  before: any;
  after: any;
  changed: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface GraphPath {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
}
