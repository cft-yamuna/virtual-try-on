import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const readRequestBody = (request: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const isClippingMagicTestMode = (env: Record<string, string>) =>
  env.CLIPPING_MAGIC_TEST?.trim().toLowerCase() !== 'false';

const clippingMagicBackgroundRemovalPlugin = (env: Record<string, string>): Plugin => ({
  name: 'clippingmagic-background-removal',
  configureServer(server) {
    server.middlewares.use('/api/background-removal/clippingmagic', async (request, response) => {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }

      const appId = env.CLIPPING_MAGIC_APP_ID;
      const apiKey = env.CLIPPING_MAGIC_API_KEY;

      if (!appId || !apiKey) {
        sendJson(response, 500, {
          error: 'Missing CLIPPING_MAGIC_APP_ID or CLIPPING_MAGIC_API_KEY environment variable'
        });
        return;
      }

      try {
        const body = await readRequestBody(request);
        const { imageUrl } = JSON.parse(body) as { imageUrl?: unknown };

        if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) {
          sendJson(response, 400, { error: 'imageUrl must be a public http(s) URL' });
          return;
        }

        const formData = new FormData();
        formData.append('image.url', imageUrl);
        formData.append('format', 'result');

        const testMode = isClippingMagicTestMode(env);

        if (testMode) {
          formData.append('test', 'true');
        }

        console.info('[ClippingMagic API] Request', {
          url: 'https://clippingmagic.com/api/v1/images',
          imageUrl,
          format: 'result',
          test: testMode
        });

        const clippingResponse = await fetch('https://clippingmagic.com/api/v1/images', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${appId}:${apiKey}`).toString('base64')}`
          },
          body: formData
        });

        const responseBody = await clippingResponse.arrayBuffer();
        const contentType = clippingResponse.headers.get('content-type') || 'image/png';

        console.info('[ClippingMagic API] Response', {
          status: clippingResponse.status,
          ok: clippingResponse.ok,
          contentType
        });

        response.statusCode = clippingResponse.status;
        response.setHeader('Content-Type', contentType);
        response.end(Buffer.from(responseBody));
      } catch (error) {
        console.error('[ClippingMagic API] Proxy error:', error);
        sendJson(response, 500, { error: 'ClippingMagic background removal failed' });
      }
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), clippingMagicBackgroundRemovalPlugin(env)],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
