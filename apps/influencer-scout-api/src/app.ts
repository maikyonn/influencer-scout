import express from 'express';

import { handlePipelineStart } from './handlers/orchestrator.js';
import { handleCancel, handleEvents, handleGetArtifact, handleGetJob, handleGetResults } from './handlers/pipeline.js';
import { handleOpenApiYaml, handlePublicDocs } from './handlers/public-docs.js';
import { handleWeaviateSearch } from './handlers/weaviate.js';
import {
  handleAdminCreateKey,
  handleAdminWeaviateSearch,
  handleAdminPipelineStart,
  handleAdminJob,
  handleAdminJobArtifact,
  handleAdminJobArtifacts,
  handleAdminJobEvents,
  handleAdminJobEventsStream,
  handleAdminJobExternalCalls,
  handleAdminJobs,
  handleAdminKeys,
  handleAdminLogin,
  handleAdminOverview,
  handleAdminPage,
  handleAdminQueue,
  handleAdminRevokeKey,
  handleAdminUsage,
  handleAdminCancelJob,
} from './handlers/admin.js';
import { requireApiKey } from './middleware/api-auth.js';
import { requireAdminKey } from './middleware/admin-auth.js';
import { rateLimit } from './middleware/rate-limit.js';
import { buildRequestContext, createLogger } from './utils/logger.js';

export type StartupHealthCheck = { summary: any; timestamp: Date } | null;

export function createApp(options?: {
  getStartupHealthCheck?: () => StartupHealthCheck;
  registerRoutes?: (app: express.Express) => void;
}) {
  const app = express();
  const getStartupHealthCheck = options?.getStartupHealthCheck ?? (() => null);
  const registerRoutes = options?.registerRoutes;
  const appLogger = createLogger({ component: 'app' });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Basic request logging middleware
  app.use((req, res, next) => {
    const context = buildRequestContext(req);
    const logger = appLogger.child({ component: 'http', ...context });
    (req as any).logger = logger;
    (req as any).requestId = typeof (context as any).request_id === 'string' ? (context as any).request_id : undefined;
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info('request_complete', {
        status: res.statusCode,
        duration_ms: Math.round(durationMs),
        httpRequest: {
          requestMethod: req.method,
          requestUrl: req.originalUrl,
          status: res.statusCode,
          userAgent: req.headers['user-agent'],
          latency: `${durationMs.toFixed(1)}ms`,
        },
      });
    });

    next();
  });

  app.get('/health', async (_req, res) => {
    try {
      const startupHealthCheck = getStartupHealthCheck();
      if (startupHealthCheck) {
        const { summary, timestamp } = startupHealthCheck;
        const status = summary.allHealthy ? 200 : 503;
        res.status(status).json({
          status: summary.allHealthy ? 'ok' : 'degraded',
          timestamp: new Date().toISOString(),
          service: 'influencer-scout-api',
          healthCheckTimestamp: timestamp.toISOString(),
          health: summary,
        });
        return;
      }
      res.status(503).json({
        status: 'initializing',
        timestamp: new Date().toISOString(),
        service: 'influencer-scout-api',
        message: 'Health checks still running during startup',
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'influencer-scout-api',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Public landing/docs (no auth)
  app.get('/', handlePublicDocs);
  app.get('/openapi.yaml', handleOpenApiYaml);

  // Public API (API-keyed)
  app.post('/pipeline/start', requireApiKey, rateLimit({ scope: 'pipeline_start' }), handlePipelineStart);
  app.get('/pipeline/jobs/:jobId', requireApiKey, rateLimit({ scope: 'pipeline_job' }), handleGetJob);
  app.get('/pipeline/jobs/:jobId/results', requireApiKey, rateLimit({ scope: 'pipeline_results' }), handleGetResults);
  app.get('/pipeline/jobs/:jobId/artifacts/:kind', requireApiKey, rateLimit({ scope: 'pipeline_artifact' }), handleGetArtifact);
  app.get('/pipeline/jobs/:jobId/events', requireApiKey, rateLimit({ scope: 'pipeline_events' }), handleEvents);
  app.post('/pipeline/jobs/:jobId/cancel', requireApiKey, rateLimit({ scope: 'pipeline_cancel' }), handleCancel);

  app.post('/weaviate/search', requireApiKey, rateLimit({ scope: 'weaviate_search' }), handleWeaviateSearch);

  // Admin UI + APIs (admin-keyed or session cookie)
  app.post('/admin/login', handleAdminLogin);
  app.get('/admin', handleAdminPage);
  app.get('/admin/jobs', handleAdminPage);
  app.get('/admin/jobs/:jobId', handleAdminPage);
  app.get('/admin/usage', handleAdminPage);
  app.get('/admin/keys', handleAdminPage);

  app.get('/admin/api/overview', requireAdminKey, handleAdminOverview);
  app.get('/admin/api/jobs', requireAdminKey, handleAdminJobs);
  app.get('/admin/api/jobs/:jobId', requireAdminKey, handleAdminJob);
  app.get('/admin/api/jobs/:jobId/events', requireAdminKey, handleAdminJobEvents);
  app.get('/admin/api/jobs/:jobId/events/stream', requireAdminKey, handleAdminJobEventsStream);
  app.get('/admin/api/jobs/:jobId/external-calls', requireAdminKey, handleAdminJobExternalCalls);
  app.get('/admin/api/jobs/:jobId/artifacts', requireAdminKey, handleAdminJobArtifacts);
  app.get('/admin/api/jobs/:jobId/artifacts/:kind', requireAdminKey, handleAdminJobArtifact);
  app.post('/admin/api/jobs/:jobId/cancel', requireAdminKey, handleAdminCancelJob);
  app.get('/admin/api/usage', requireAdminKey, handleAdminUsage);
  app.get('/admin/api/queue', requireAdminKey, handleAdminQueue);
  app.get('/admin/api/keys', requireAdminKey, handleAdminKeys);
  app.post('/admin/api/keys', requireAdminKey, handleAdminCreateKey);
  app.post('/admin/api/keys/:id/revoke', requireAdminKey, handleAdminRevokeKey);
  app.post('/admin/api/weaviate/search', requireAdminKey, handleAdminWeaviateSearch);
  app.post('/admin/api/pipeline/start', requireAdminKey, handleAdminPipelineStart);

  if (registerRoutes) registerRoutes(app);

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const logger = (req as any).logger?.child({ component: 'app', action: 'error_middleware' }) ?? appLogger;
    logger.error('unhandled_error', { error: err });
    if (!res.headersSent) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    }
  });

  return app;
}
