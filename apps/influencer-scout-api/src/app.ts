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

function wrapAsync<
  Req extends express.Request = express.Request,
  Res extends express.Response = express.Response,
  Next extends express.NextFunction = express.NextFunction,
>(fn: (req: Req, res: Res, next: Next) => any) {
  return (req: Req, res: Res, next: Next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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
  app.get('/', wrapAsync(handlePublicDocs as any));
  app.get('/openapi.yaml', wrapAsync(handleOpenApiYaml as any));

  // Public API (API-keyed)
  app.post('/pipeline/start', requireApiKey, rateLimit({ scope: 'pipeline_start' }), wrapAsync(handlePipelineStart as any));
  app.get('/pipeline/jobs/:jobId', requireApiKey, rateLimit({ scope: 'pipeline_job' }), wrapAsync(handleGetJob as any));
  app.get('/pipeline/jobs/:jobId/results', requireApiKey, rateLimit({ scope: 'pipeline_results' }), wrapAsync(handleGetResults as any));
  app.get('/pipeline/jobs/:jobId/artifacts/:kind', requireApiKey, rateLimit({ scope: 'pipeline_artifact' }), wrapAsync(handleGetArtifact as any));
  app.get('/pipeline/jobs/:jobId/events', requireApiKey, rateLimit({ scope: 'pipeline_events' }), wrapAsync(handleEvents as any));
  app.post('/pipeline/jobs/:jobId/cancel', requireApiKey, rateLimit({ scope: 'pipeline_cancel' }), wrapAsync(handleCancel as any));

  app.post('/weaviate/search', requireApiKey, rateLimit({ scope: 'weaviate_search' }), wrapAsync(handleWeaviateSearch as any));

  // Admin UI + APIs (admin-keyed or session cookie)
  app.post('/admin/login', wrapAsync(handleAdminLogin as any));
  app.get('/admin', wrapAsync(handleAdminPage as any));
  app.get('/admin/jobs', wrapAsync(handleAdminPage as any));
  app.get('/admin/jobs/:jobId', wrapAsync(handleAdminPage as any));
  app.get('/admin/usage', wrapAsync(handleAdminPage as any));
  app.get('/admin/keys', wrapAsync(handleAdminPage as any));

  app.get('/admin/api/overview', requireAdminKey, wrapAsync(handleAdminOverview as any));
  app.get('/admin/api/jobs', requireAdminKey, wrapAsync(handleAdminJobs as any));
  app.get('/admin/api/jobs/:jobId', requireAdminKey, wrapAsync(handleAdminJob as any));
  app.get('/admin/api/jobs/:jobId/events', requireAdminKey, wrapAsync(handleAdminJobEvents as any));
  app.get('/admin/api/jobs/:jobId/events/stream', requireAdminKey, wrapAsync(handleAdminJobEventsStream as any));
  app.get('/admin/api/jobs/:jobId/external-calls', requireAdminKey, wrapAsync(handleAdminJobExternalCalls as any));
  app.get('/admin/api/jobs/:jobId/artifacts', requireAdminKey, wrapAsync(handleAdminJobArtifacts as any));
  app.get('/admin/api/jobs/:jobId/artifacts/:kind', requireAdminKey, wrapAsync(handleAdminJobArtifact as any));
  app.post('/admin/api/jobs/:jobId/cancel', requireAdminKey, wrapAsync(handleAdminCancelJob as any));
  app.get('/admin/api/usage', requireAdminKey, wrapAsync(handleAdminUsage as any));
  app.get('/admin/api/queue', requireAdminKey, wrapAsync(handleAdminQueue as any));
  app.get('/admin/api/keys', requireAdminKey, wrapAsync(handleAdminKeys as any));
  app.post('/admin/api/keys', requireAdminKey, wrapAsync(handleAdminCreateKey as any));
  app.post('/admin/api/keys/:id/revoke', requireAdminKey, wrapAsync(handleAdminRevokeKey as any));
  app.post('/admin/api/weaviate/search', requireAdminKey, wrapAsync(handleAdminWeaviateSearch as any));
  app.post('/admin/api/pipeline/start', requireAdminKey, wrapAsync(handleAdminPipelineStart as any));

  if (registerRoutes) registerRoutes(app);

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const logger = (req as any).logger?.child({ component: 'app', action: 'error_middleware' }) ?? appLogger;
    logger.error('unhandled_error', { error: err });
    const requestId = (req as any).requestId;
    if (!res.headersSent) res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred', request_id: requestId });
  });

  return app;
}
