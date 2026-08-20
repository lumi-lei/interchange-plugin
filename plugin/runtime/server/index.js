import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { migrate } from './db.js';
import { router } from './routes.js';
migrate();
export function configureBaseMiddleware(app) {
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '5mb' }));
    app.use(express.urlencoded({ extended: true, limit: '5mb' }));
}
export function mountApi(app, mountPath = '/api') {
    app.use(mountPath, async (_req, _res, next) => {
        try {
            await migrate();
            next();
        }
        catch (error) {
            next(error);
        }
    });
    // 通用 API 限流已在 routes.ts 内部挂载（/health 除外，供面板状态轮询使用）。
    if (mountPath) {
        app.use(mountPath, router);
        return;
    }
    app.use(router);
}
export function errorHandler(err, _req, res, next) {
    if (res.headersSent)
        return next(err);
    if (err instanceof multer.MulterError) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: err.message, code: err.code });
    }
    const status = typeof err === 'object' && err && 'status' in err ? Number(err.status) : 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(status || 500).json({ error: message });
}
export function createApp() {
    const app = express();
    configureBaseMiddleware(app);
    mountApi(app);
    const dist = path.resolve(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*splat', (_req, res) => {
        res.sendFile(path.join(dist, 'index.html'));
    });
    app.use(errorHandler);
    return app;
}
const isCliEntrypoint = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (process.env.NODE_ENV !== 'test' && isCliEntrypoint) {
    createApp().listen(config.port, '127.0.0.1', () => {
        console.log(`Interchange server listening on http://127.0.0.1:${config.port}`);
    });
}
