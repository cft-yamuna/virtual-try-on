import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';

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

const isClippingMagicTestMode = () =>
  process.env.CLIPPING_MAGIC_TEST?.trim().toLowerCase() !== 'false';

const getImageUrl = async (request: IncomingMessage) => {
  const body = await readRequestBody(request);
  const parsed = JSON.parse(body) as { imageUrl?: unknown };

  return parsed.imageUrl;
};

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse
) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const appId = process.env.CLIPPING_MAGIC_APP_ID;
  const apiKey = process.env.CLIPPING_MAGIC_API_KEY;

  if (!appId || !apiKey) {
    sendJson(response, 500, {
      error: 'Missing CLIPPING_MAGIC_APP_ID or CLIPPING_MAGIC_API_KEY environment variable'
    });
    return;
  }

  try {
    const imageUrl = await getImageUrl(request);

    if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) {
      sendJson(response, 400, { error: 'imageUrl must be a public http(s) URL' });
      return;
    }

    const formData = new FormData();
    formData.append('image.url', imageUrl);
    formData.append('format', 'result');

    const testMode = isClippingMagicTestMode();

    if (testMode) {
      formData.append('test', 'true');
    }

    console.info('[ClippingMagic API] Production request', {
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

    console.info('[ClippingMagic API] Production response', {
      status: clippingResponse.status,
      ok: clippingResponse.ok,
      contentType
    });

    response.statusCode = clippingResponse.status;
    response.setHeader('Content-Type', contentType);
    response.end(Buffer.from(responseBody));
  } catch (error) {
    console.error('[ClippingMagic API] Production proxy error:', error);
    sendJson(response, 500, { error: 'ClippingMagic background removal failed' });
  }
}
