import type { Request } from 'express';

export type Severity = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

export interface Logger {
	child(extra: LogContext): Logger;
	debug(message: string, meta?: LogContext): void;
	info(message: string, meta?: LogContext): void;
	warn(message: string, meta?: LogContext): void;
	error(message: string, meta?: LogContext): void;
}

const severityOrder: Record<Severity, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const defaultLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const minLevel = (defaultLevel || 'info').toLowerCase() as Severity;

const writers: Record<Severity, (line: string) => void> = {
	debug: (line) => (console.debug ? console.debug(line) : console.log(line)),
	info: (line) => (console.info ? console.info(line) : console.log(line)),
	warn: (line) => console.warn(line),
	error: (line) => console.error(line),
};

const SENSITIVE_KEY = /(^|_)(secret|token|password|passwd|authorization|api[_-]?key|private[_-]?key|refresh[_-]?token|access[_-]?token)($|_)/i;
const EMAIL_KEY = /(^|_)(email|email_address|from|to|from_email|to_email|sender|sender_email|recipient|recipient_email)($|_)/i;
const CONTENT_KEY = /(^|_)(subject|html|html_body|text|text_body|body|content)($|_)/i;

const isLikelyTokenString = (value: string): boolean => {
	const trimmed = value.trim();
	if (!trimmed) return false;
	if (/^Bearer\s+/i.test(trimmed)) return true;
	// JWT-like
	if (trimmed.length > 80 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return true;
	// Long base64-ish payloads
	if (trimmed.length > 120 && /^[A-Za-z0-9+/=_.-]+$/.test(trimmed)) return true;
	return false;
};

const redactEmail = (raw: string): string => {
	const trimmed = raw.trim();
	const match = trimmed.match(/^[^@\s]+@([^@\s]+)$/);
	if (match?.[1]) {
		return `***@${match[1].toLowerCase()}`;
	}
	if (trimmed.includes('@')) {
		return '[REDACTED_EMAIL]';
	}
	return '[REDACTED]';
};

const sanitize = (value: unknown, key?: string): unknown => {
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	if (typeof key === 'string' && SENSITIVE_KEY.test(key)) {
		return '[REDACTED]';
	}

	if (typeof key === 'string' && CONTENT_KEY.test(key)) {
		return '[REDACTED]';
	}

	if (typeof key === 'string' && EMAIL_KEY.test(key)) {
		if (typeof value === 'string') return redactEmail(value);
		return '[REDACTED]';
	}

	if (typeof value === 'string' && isLikelyTokenString(value)) {
		return '[REDACTED]';
	}

	if (value && typeof value === 'object') {
		if (Array.isArray(value)) {
			return value.map((item) => sanitize(item, key));
		}
		return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [entryKey, val]) => {
			acc[entryKey] = sanitize(val, entryKey);
			return acc;
		}, {});
	}

	return value;
};

const shouldLog = (severity: Severity): boolean => {
	return severityOrder[severity] >= (severityOrder[minLevel] ?? severityOrder.info);
};

const buildLogger = (baseContext: LogContext): Logger => {
	const context = { ...baseContext };

	const write = (severity: Severity, message: string, meta?: LogContext) => {
		if (!shouldLog(severity)) return;
		const entry: Record<string, unknown> = {
			timestamp: new Date().toISOString(),
			severity: severity.toUpperCase(),
			...context,
			message,
		};

		if (meta) {
			for (const [key, value] of Object.entries(meta)) {
				entry[key] = sanitize(value, key);
			}
		}

		for (const key of Object.keys(entry)) {
			if (entry[key] === undefined) {
				delete entry[key];
			}
		}

		writers[severity](JSON.stringify(entry));
	};

	return {
		child(extra: LogContext) {
			return buildLogger({ ...context, ...extra });
		},
		debug(message: string, meta?: LogContext) {
			write('debug', message, meta);
		},
		info(message: string, meta?: LogContext) {
			write('info', message, meta);
		},
		warn(message: string, meta?: LogContext) {
			write('warn', message, meta);
		},
		error(message: string, meta?: LogContext) {
			write('error', message, meta);
		},
	};
};

const getProjectId = (): string =>
	process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'unknown';

const parseTraceHeader = (header: string | string[] | undefined) => {
	if (!header) return null;
	const value = Array.isArray(header) ? header[0] : header;
	if (!value) return null;
	const [traceId, spanPart] = value.split('/');
	if (!traceId) return null;
	const [spanId, options] = (spanPart || '').split(';');
	const sampled = options?.includes('o=1');
	return { traceId, spanId: spanId || undefined, sampled };
};

export const createLogger = (context: LogContext = {}): Logger =>
	buildLogger({ service: 'influencer-scout-api', environment: process.env.NODE_ENV || 'unknown', ...context });

export const buildRequestContext = (req: Request): LogContext => {
	const requestIdHeader = req.headers['x-request-id'];
	const requestId = Array.isArray(requestIdHeader)
		? requestIdHeader[0]
		: requestIdHeader || undefined;
	const traceContext = parseTraceHeader(req.headers['x-cloud-trace-context']);
	const context: LogContext = {
		request_id: requestId,
		http_method: req.method,
		http_path: req.path,
		user_agent: req.headers['user-agent'],
	};

	if (traceContext?.traceId) {
		const projectId = getProjectId();
		context['logging.googleapis.com/trace'] = `projects/${projectId}/traces/${traceContext.traceId}`;
		if (traceContext.spanId) {
			context['logging.googleapis.com/spanId'] = traceContext.spanId;
		}
		if (traceContext.sampled !== undefined) {
			context['logging.googleapis.com/trace_sampled'] = traceContext.sampled;
		}
		if (!context.request_id) {
			context.request_id = traceContext.traceId;
		}
	}

	return context;
};
