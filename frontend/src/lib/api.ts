import type {
  ApiErrorBody,
  CurrentMetrics,
  DatabaseInfo,
  HealthResponse,
  MetricHistory,
  MetricSource,
  OverviewResponse,
  ProfileResponse,
  RowsResponse,
  TableInfo,
  TableSchema,
  TimelineResponse,
} from './types';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';
const TOKEN_KEY = 'metricshub:token';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  get isUnauthorized() {
    return this.status === 401 || this.status === 403;
  }
}

export function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* modo privado/iframe sem storage */
  }
}

type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(params: Record<string, QueryValue | QueryValue[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') search.append(key, String(item));
      }
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const token = getStoredToken();
  if (token) headers.set('X-API-Token', token);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch (cause) {
    if ((cause as Error).name === 'AbortError') throw cause;
    throw new ApiError(0, 'network_error', 'Não foi possível alcançar o servidor.');
  }

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* resposta não-JSON (ex.: 502 de proxy) */
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'http_error',
      body?.error?.message ?? `Falha na requisição (HTTP ${response.status}).`,
      body?.error?.request_id,
    );
  }
  return (await response.json()) as T;
}

function signalOf(signal?: AbortSignal): RequestInit {
  return signal ? { signal } : {};
}

export const api = {
  health: (signal?: AbortSignal) =>
    request<HealthResponse>('/health', signalOf(signal)),

  listDatabases: (signal?: AbortSignal) =>
    request<{ databases: DatabaseInfo[] }>('/databases', signalOf(signal)).then((r) => r.databases),

  overview: (dbId: string, signal?: AbortSignal) =>
    request<OverviewResponse>(`/databases/${encodeURIComponent(dbId)}/overview`, signalOf(signal)),

  listTables: (dbId: string, signal?: AbortSignal) =>
    request<{ tables: TableInfo[] }>(
      `/databases/${encodeURIComponent(dbId)}/tables`,
      signalOf(signal),
    ).then((r) => r.tables),

  tableSchema: (dbId: string, table: string, signal?: AbortSignal) =>
    request<TableSchema>(
      `/databases/${encodeURIComponent(dbId)}/tables/${encodeURIComponent(table)}`,
      signalOf(signal),
    ),

  rows: (
    dbId: string,
    table: string,
    params: {
      page?: number;
      pageSize?: number;
      sort?: string | null;
      order?: 'asc' | 'desc';
      search?: string;
      filters?: { column: string; operator: string; value: string | null }[];
    },
    signal?: AbortSignal,
  ) => {
    const query = buildQuery({
      page: params.page ?? 1,
      page_size: params.pageSize,
      sort: params.sort ?? undefined,
      order: params.sort ? params.order ?? 'asc' : undefined,
      search: params.search,
      filter: (params.filters ?? []).map(
        (f) => `${f.column}:${f.operator}${f.value !== null ? `:${f.value}` : ''}`,
      ),
    });
    return request<RowsResponse>(
      `/databases/${encodeURIComponent(dbId)}/tables/${encodeURIComponent(table)}/rows${query}`,
      signalOf(signal),
    );
  },

  profile: (dbId: string, table: string, signal?: AbortSignal) =>
    request<ProfileResponse>(
      `/databases/${encodeURIComponent(dbId)}/tables/${encodeURIComponent(table)}/profile`,
      signalOf(signal),
    ),

  timeline: (
    dbId: string,
    table: string,
    params: { valueColumn: string; timeColumn?: string | null; agg?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    request<TimelineResponse>(
      `/databases/${encodeURIComponent(dbId)}/tables/${encodeURIComponent(table)}/timeline` +
        buildQuery({
          value_column: params.valueColumn,
          time_column: params.timeColumn ?? undefined,
          agg: params.agg,
          limit: params.limit,
        }),
      signalOf(signal),
    ),

  exportUrl: (dbId: string, table: string, format: 'csv' | 'json') =>
    `${BASE}/databases/${encodeURIComponent(dbId)}/tables/${encodeURIComponent(table)}/export?format=${format}`,

  metricSources: (signal?: AbortSignal) =>
    request<{ sources: MetricSource[] }>('/metrics', signalOf(signal)).then((r) => r.sources),

  currentMetrics: (sourceId: string, signal?: AbortSignal) =>
    request<CurrentMetrics>(
      `/metrics/${encodeURIComponent(sourceId)}/current`,
      signalOf(signal),
    ),

  metricHistory: (
    sourceId: string,
    params: { limit?: number; bucket?: 'auto' | 'day' | 'hour' | 'raw' },
    signal?: AbortSignal,
  ) =>
    request<MetricHistory>(
      `/metrics/${encodeURIComponent(sourceId)}/history` +
        buildQuery({ limit: params.limit, bucket: params.bucket }),
      signalOf(signal),
    ),
};

export function downloadExport(url: string, filename: string): void {
  const token = getStoredToken();
  // Downloads via fetch para injetar o token sem expor credenciais na URL.
  void fetch(url, { headers: token ? { 'X-API-Token': token } : undefined })
    .then(async (response) => {
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    })
    .catch((error: Error) => {
      alert(`Não foi possível exportar: ${error.message}`);
    });
}
