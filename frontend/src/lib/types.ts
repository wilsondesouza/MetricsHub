/** Contratos espelhados do backend Flask (fonte: metricshub/api/*). */

export type ColumnKind =
  | 'integer'
  | 'real'
  | 'text'
  | 'blob'
  | 'datetime'
  | 'unknown'
  | 'number'
  | 'other';

export interface DatabaseInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  exists: boolean;
  readonly: boolean;
  size_bytes: number;
}

export interface TableInfo {
  name: string;
  type: 'table' | 'view';
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  not_null: boolean;
  default: string | null;
  primary_key: boolean;
  kind: ColumnKind;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: string[];
}

export interface ForeignKeyInfo {
  id: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
}

export interface TableSchema {
  name: string;
  type: 'table' | 'view';
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKeyInfo[];
  column_count: number;
}

export type CellValue =
  | string
  | number
  | boolean
  | null
  | { __type: 'blob'; size: number; preview: string };

export interface PageInfo {
  page: number;
  page_size: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface RowsResponse {
  table: string;
  columns: ColumnInfo[];
  rows: Record<string, CellValue>[];
  pagination: PageInfo;
  query_ms: number;
  order: { column: string | null; direction: 'asc' | 'desc' } | null;
  search: string | null;
  filters: { column: string; operator: string; value: string | null }[];
}

export interface TableOverview {
  name: string;
  type: 'table' | 'view';
  rows: number;
  columns: number;
}

export interface OverviewResponse {
  database: string;
  id?: string;
  name?: string;
  description?: string;
  readonly?: boolean;
  table_count: number;
  row_total: number;
  tables: TableOverview[];
  size_bytes: number;
}

export interface ColumnProfileBase {
  name: string;
  type: string;
  kind: ColumnKind;
  primary_key: boolean;
  not_null: boolean;
  null_ratio: number;
  distinct_sampled: number;
  is_datetime: boolean;
  top_values?: { value: string; count: number }[];
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sum?: number;
  histogram?: { from: number; to: number; count: number }[];
  range?: { min: string; max: string };
}

export interface ProfileResponse {
  table: string;
  row_total: number;
  sampled_rows: number;
  sampled: boolean;
  datetime_column: string | null;
  numeric_columns: string[];
  columns: ColumnProfileBase[];
}

export interface TimelineResponse {
  table: string;
  time_column: string | null;
  value_column: string;
  aggregation: string;
  points: { label: string; value: number | null; count?: number }[];
}

export interface MetricSeriesConfig {
  key: string;
  column: string;
  label: string;
  unit: string;
  max: number | null;
  warn_at: number | null;
  crit_at: number | null;
}

export interface MetricSource {
  id: string;
  database: string;
  table: string;
  title: string;
  series: MetricSeriesConfig[];
}

export interface CurrentMetrics {
  source: string;
  timestamp: string;
  values: Record<string, number | null>;
  series: MetricSeriesConfig[];
}

export interface MetricHistory {
  source: string;
  table: string;
  series: MetricSeriesConfig[];
  points: (Record<string, number | null | string> & {
    bucket: string;
    label: string;
    samples: number;
  })[];
  stats: Record<
    string,
    { min?: number; max?: number; avg?: number; p95?: number; latest?: number }
  >;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime_seconds: number;
  auth_mode: 'none' | 'loopback' | 'token';
  databases: { total: number; available: number };
  features: { raw_sql: boolean; downloads: boolean; metrics: number };
}

export interface ApiErrorBody {
  error: { code: string; message: string; request_id?: string; details?: unknown };
}
