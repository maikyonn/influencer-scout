import type { Logger } from '../utils/logger.js';

declare module 'express-serve-static-core' {
	interface Request {
		logger?: Logger;
		requestId?: string;
	}
}
