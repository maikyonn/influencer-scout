export type Platform = 'instagram' | 'tiktok';

export type PipelineStartRequest = {
  business_description: string;
  top_n?: number;
  platform?: Platform;
  min_followers?: number | null;
  max_followers?: number | null;
};

export type PipelineStartResponse = {
  job_id: string;
  status: string;
  message?: string;
  request_id?: string;
};

export type PipelineJobStatus = {
  job_id: string;
  status: string;
  progress: number;
  current_stage: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  meta: Record<string, unknown>;
  error: unknown;
};

export type PipelineEvent = {
  id: number;
  job_id: string;
  ts: string;
  level: string;
  type: string;
  data: Record<string, unknown>;
};

export type PipelineEventsResponse = {
  job_id: string;
  events: PipelineEvent[];
};

export type InfluencerProfile = {
  platform?: string;
  profile_url?: string;
  url?: string;
  display_name?: string;
  followers?: number;
  fit_score?: number;
  fit_summary?: string;
  fit_rationale?: string;
};

export type PipelineFinalArtifact = {
  job_id?: string;
  profiles?: InfluencerProfile[];
  summary?: unknown;
  meta?: unknown;
};

export type WaterfallTimingArtifact = {
  pipeline_start?: number;
  pipeline_end?: number;
  stages?: Record<
    string,
    {
      start?: number;
      end?: number;
      duration?: number;
    }
  >;
};

export type WeaviateSearchRequest = {
  query: string;
  top_k?: number;
  platform?: Platform;
  min_followers?: number | null;
  max_followers?: number | null;
};

export type WeaviateCandidate = {
  id: string;
  score?: number;
  distance?: number;
  profile_url: string;
  platform?: string;
  display_name?: string;
  biography?: string;
  followers?: number;
};

export type WeaviateSearchResponse = {
  query: string;
  candidates: WeaviateCandidate[];
  meta?: Record<string, unknown>;
};

