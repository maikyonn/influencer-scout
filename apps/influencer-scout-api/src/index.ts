import { createApp, type StartupHealthCheck } from './app.js';
import { runHealthChecks } from './utils/health-check.js';
import { createLogger } from './utils/logger.js';

// Run health checks once on startup
let startupHealthCheck: StartupHealthCheck = null;
(async () => {
  const logger = createLogger({ component: 'startup' });
  try {
    logger.info('startup_configuration', {
      weaviate_url: process.env.WEAVIATE_URL || 'not configured',
      openai_model: process.env.OPENAI_MODEL || 'gpt-5-nano',
      deepinfra_embedding_model: process.env.DEEPINFRA_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
      max_concurrent_weaviate_searches: process.env.MAX_CONCURRENT_WEAVIATE_SEARCHES || '12',
      max_concurrent_llm_requests: process.env.MAX_CONCURRENT_LLM_REQUESTS || '20',
    });

    logger.info('startup_health_checks_begin');
    const summary = await runHealthChecks();
    startupHealthCheck = { summary, timestamp: new Date() };
    if (summary.allHealthy) logger.info('startup_health_checks_ok');
    else logger.warn('startup_health_checks_degraded', { errors: summary.errors });
  } catch (error) {
    logger.error('startup_health_checks_failed', { error });
    startupHealthCheck = {
      summary: {
        allHealthy: false,
        checks: [],
        errors: [{ service: 'Startup', message: error instanceof Error ? error.message : String(error) }],
      },
      timestamp: new Date(),
    };
  }
})();

const app = createApp({ getStartupHealthCheck: () => startupHealthCheck });

const port = Number(process.env.PORT || 8080);
const server = app.listen(port, () => {
  createLogger({ component: 'startup' }).info('server_listening', { port });
});

process.on('SIGTERM', () => {
  const logger = createLogger({ component: 'startup' });
  logger.info('shutdown_signal_received', { signal: 'SIGTERM' });
  server.close(() => {
    logger.info('server_closed');
    process.exit(0);
  });
});

