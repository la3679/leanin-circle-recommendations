import express, { type ErrorRequestHandler } from 'express';
import type { Recommender } from './recommendations.js';

export function createApp(recommender: Recommender) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health', (_req, res) => { res.json({ status: 'ok', as_of: recommender.asOf }); });
  app.get('/users/:userId/recommendations', (req, res) => {
    const rawId = req.params.userId;
    const userId = Number(rawId);
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(userId)) {
      res.status(400).json({ error: { code: 'INVALID_USER_ID', message: 'userId must be a positive safe integer.' } });
      return;
    }
    if (Object.keys(req.query).some(key => key !== 'limit' && key !== 'debug')) {
      res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Supported query parameters: limit, debug.' } });
      return;
    }
    const rawLimit = req.query.limit ?? '5';
    if (typeof rawLimit !== 'string' || !/^[1-9]\d*$/.test(rawLimit)
      || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) > 20) {
      res.status(400).json({ error: { code: 'INVALID_LIMIT', message: 'limit must be an integer from 1 to 20.' } });
      return;
    }
    const rawDebug = req.query.debug ?? 'false';
    if (rawDebug !== 'true' && rawDebug !== 'false') {
      res.status(400).json({ error: { code: 'INVALID_DEBUG', message: 'debug must be true or false.' } });
      return;
    }
    const result = recommender.recommend(userId, Number(rawLimit), rawDebug === 'true');
    if (!result) {
      res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
      return;
    }
    res.json(result);
  });
  app.use((_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }); });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof URIError) {
      res.status(400).json({ error: { code: 'INVALID_PATH', message: 'Invalid URL encoding.' } });
      return;
    }
    console.error(error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  };
  app.use(handleError);
  return app;
}
