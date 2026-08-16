import express from 'express';
import { configureBaseMiddleware, errorHandler, mountApi } from '../server/index.js';

const app = express();

configureBaseMiddleware(app);
mountApi(app, '/api');
mountApi(app, '');
app.use((_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});
app.use(errorHandler);

export default app;
