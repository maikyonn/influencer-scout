/**
 * Centralized timing tracker for pipeline stages and sub-stages.
 * Persists timing snapshots into Postgres artifacts (kind: "timing").
 */

import { upsertArtifact } from '../storage/artifacts.js';
import { createLogger } from './logger.js';

const logger = createLogger({ component: 'timing-tracker' });

export type PipelineStage =
  | 'query_expansion'
  | 'weaviate_search'
  | 'brightdata_collection'
  | 'llm_analysis';

export interface StageTiming {
  start: number; // Relative to pipeline_start (seconds)
  end?: number;
  duration?: number;
  sub_stages?: {
    [key: string]: StageTiming | StageTiming[];
  };
}

export interface PipelineTimingData {
  pipeline_start: number; // Absolute timestamp (seconds)
  pipeline_end?: number; // Absolute timestamp (seconds)
  pipeline_duration?: number; // Duration in seconds
  stages: {
    query_expansion?: StageTiming;
    weaviate_search?: StageTiming;
    brightdata_collection?: StageTiming;
    llm_analysis?: StageTiming;
  };
}

/**
 * Centralized timing tracker for pipeline execution.
 *
 * Compatibility note: older code calls `saveToFirestore()`; we keep the method name
 * but persist to Postgres artifacts instead.
 */
export class PipelineTimingTracker {
  private jobId: string;
  private pipelineStartTime: number; // Absolute timestamp (seconds)
  private timing: PipelineTimingData;
  private activeStages: Map<PipelineStage, number>;
  private activeSubStages: Map<string, number>;

  constructor(jobId: string) {
    this.jobId = jobId;
    this.pipelineStartTime = Date.now() / 1000;
    this.timing = {
      pipeline_start: this.pipelineStartTime,
      stages: {},
    };
    this.activeStages = new Map();
    this.activeSubStages = new Map();
  }

  getPipelineStartTime(): number {
    return this.pipelineStartTime;
  }

  private getRelativeTime(): number {
    return Date.now() / 1000 - this.pipelineStartTime;
  }

  startStage(stage: PipelineStage): void {
    const t = this.getRelativeTime();
    this.activeStages.set(stage, t);
    if (!this.timing.stages[stage]) this.timing.stages[stage] = { start: t };
    else {
      this.timing.stages[stage]!.start = t;
      delete this.timing.stages[stage]!.end;
      delete this.timing.stages[stage]!.duration;
    }
  }

  endStage(stage: PipelineStage): void {
    const t = this.getRelativeTime();
    const start = this.activeStages.get(stage);
    if (start === undefined) {
      logger.warn('timing_stage_end_without_start', { stage });
      return;
    }
    if (!this.timing.stages[stage]) this.timing.stages[stage] = { start };
    this.timing.stages[stage]!.end = t;
    this.timing.stages[stage]!.duration = t - start;
    this.activeStages.delete(stage);
  }

  startSubStage(stage: PipelineStage, subStage: string): void {
    const key = `${stage}.${subStage}`;
    this.activeSubStages.set(key, this.getRelativeTime());
    const stageTiming = (this.timing.stages[stage] ??= { start: this.getRelativeTime() });
    stageTiming.sub_stages ??= {};
    stageTiming.sub_stages[subStage] = { start: this.getRelativeTime() };
  }

  endSubStage(stage: PipelineStage, subStage: string): void {
    const key = `${stage}.${subStage}`;
    const end = this.getRelativeTime();
    const start = this.activeSubStages.get(key);
    if (start === undefined) {
      logger.warn('timing_substage_end_without_start', { stage, subStage });
      return;
    }
    const stageTiming = this.timing.stages[stage];
    const sub = stageTiming?.sub_stages?.[subStage] as StageTiming | undefined;
    if (sub) {
      sub.end = end;
      sub.duration = end - start;
    }
    this.activeSubStages.delete(key);
  }

  addBatchTiming(stage: PipelineStage, batchIndex: number, start: number, end?: number): void {
    const stageTiming = (this.timing.stages[stage] ??= { start: this.getRelativeTime() });
    stageTiming.sub_stages ??= {};
    const batches = (stageTiming.sub_stages['batches'] ??= []) as StageTiming[];
    const timing: StageTiming = { start };
    if (end !== undefined) {
      timing.end = end;
      timing.duration = end - start;
    }
    batches[batchIndex] = timing;
  }

  endPipeline(): void {
    const end = Date.now() / 1000;
    this.timing.pipeline_end = end;
    this.timing.pipeline_duration = end - this.timing.pipeline_start;
  }

  async saveToFirestore(): Promise<void> {
    try {
      await upsertArtifact(this.jobId, 'timing', this.timing);
    } catch (error) {
      logger.warn('timing_persist_failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

