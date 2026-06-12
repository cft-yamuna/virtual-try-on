export interface TryOnRequest {
  userImage: string;
  clothingImage: string;
}

export interface YouCamClothPayload {
  src_file_id?: string;
  src_file_url?: string;
  ref_file_id?: string;
  ref_file_url?: string;
  garment_category: 'upper_body';
}

export const YOUCAM_SAMPLE_CLOTH_PAYLOAD: YouCamClothPayload = {
  src_file_id: 'vtW/nI9AsnHK1vvAQLAFOTZ8UTeG/AanY6dSUz4i/UCpqupmNZ5FN4+BIkGveheo',
  ref_file_id: '0CziI4iaQbtaZlUi5eArOu/HGHPfHGVLrAXGhIwWSD0LbKfeLEmuXUa9yH4wuc2K',
  garment_category: 'upper_body'
};

const YOUCAM_CLOTH_TASK_URL = 'https://yce-api-01.makeupar.com/s2s/v3.0/task/cloth';
const YOUCAM_API_KEY = import.meta.env.VITE_YOUCAM_API_KEY;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 300;

type Fetcher = typeof fetch;
type Sleep = (ms: number) => Promise<void>;
type Uploader = (imageUrl: string) => Promise<string>;

interface YouCamTaskOptions {
  apiKey: string;
  fetcher?: Fetcher;
}

interface StartYouCamTaskOptions extends YouCamTaskOptions {
  payload?: YouCamClothPayload;
}

interface PollYouCamTaskOptions extends YouCamTaskOptions {
  intervalMs?: number;
  maxAttempts?: number;
  sleep?: Sleep;
}

interface RunYouCamVirtualTryOnOptions extends YouCamTaskOptions {
  intervalMs?: number;
  maxAttempts?: number;
  payload?: YouCamClothPayload;
  sleep?: Sleep;
  uploader?: Uploader;
}

interface BuildYouCamClothPayloadInput {
  userImageUrl: string;
  clothingImageUrl: string;
}

const sleep: Sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));

const isPublicHttpUrl = (imageSource: string) => /^https?:\/\//i.test(imageSource);

const summarizeImageSource = (imageSource: string) => {
  if (imageSource.startsWith('data:')) {
    return {
      type: 'data-url',
      length: imageSource.length
    };
  }

  return {
    type: isPublicHttpUrl(imageSource) ? 'public-url' : 'relative-url',
    value: imageSource
  };
};

export const buildYouCamClothPayload = ({
  userImageUrl,
  clothingImageUrl
}: BuildYouCamClothPayloadInput): YouCamClothPayload => ({
  src_file_url: userImageUrl,
  ref_file_url: clothingImageUrl,
  garment_category: 'upper_body'
});

const assertApiKey = (apiKey: string) => {
  if (!apiKey?.trim()) {
    throw new Error('Missing VITE_YOUCAM_API_KEY environment variable');
  }
};

const createHeaders = (apiKey: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${apiKey}`
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stringifyPayload = (payload: unknown) => {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

const requestJson = async (
  fetcher: Fetcher,
  method: 'GET' | 'POST',
  url: string,
  apiKey: string,
  body?: unknown
): Promise<unknown> => {
  const init: RequestInit = {
    method,
    headers: createHeaders(apiKey)
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  console.info('[YouCam API] Request', {
    method,
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ***'
    },
    body: body ?? null
  });

  const response = await fetcher(url, init);
  const text = await response.text();
  let json: unknown = {};

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
  }

  console.info('[YouCam API] Response', {
    method,
    url,
    status: response.status,
    ok: response.ok,
    json
  });

  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status}${text ? ` ${text}` : ''}`);
  }

  return json;
};

const getTaskId = (payload: unknown) => {
  const data = isRecord(payload) ? payload.data : null;
  return isRecord(data) && typeof data.task_id === 'string' ? data.task_id : null;
};

const getTaskStatus = (payload: unknown) => {
  const data = isRecord(payload) ? payload.data : null;
  return isRecord(data) && typeof data.task_status === 'string' ? data.task_status : null;
};

const urlKeys = ['url', 'result_url', 'image_url', 'output_url', 'file_url'];

const findUrl = (value: unknown): string | null => {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item);
      if (found) return found;
    }
  }

  if (isRecord(value)) {
    for (const key of urlKeys) {
      const candidate = value[key];
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
        return candidate;
      }
    }

    for (const candidate of Object.values(value)) {
      const found = findUrl(candidate);
      if (found) return found;
    }
  }

  return null;
};

export const extractYouCamResultUrl = (payload: unknown): string | null => {
  const data = isRecord(payload) ? payload.data : null;

  if (isRecord(data)) {
    return findUrl(data.results) || findUrl(data.result) || findUrl(data);
  }

  return findUrl(payload);
};

export const startYouCamClothTask = async ({
  apiKey,
  fetcher = fetch,
  payload = YOUCAM_SAMPLE_CLOTH_PAYLOAD
}: StartYouCamTaskOptions): Promise<string> => {
  assertApiKey(apiKey);
  console.info('[YouCam] Starting cloth task.', {
    endpoint: YOUCAM_CLOTH_TASK_URL,
    payload
  });

  const response = await requestJson(fetcher, 'POST', YOUCAM_CLOTH_TASK_URL, apiKey, payload);
  const taskId = getTaskId(response);

  if (!taskId) {
    throw new Error(`task_id not found in response: ${stringifyPayload(response)}`);
  }

  console.info('[YouCam] Cloth task started.', { taskId });

  return taskId;
};

export const pollYouCamClothTask = async (
  taskId: string,
  {
    apiKey,
    fetcher = fetch,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
    sleep: sleepFn = sleep
  }: PollYouCamTaskOptions
): Promise<unknown> => {
  assertApiKey(apiKey);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await requestJson(
      fetcher,
      'GET',
      `${YOUCAM_CLOTH_TASK_URL}/${encodeURIComponent(taskId)}`,
      apiKey
    );
    const taskStatus = getTaskStatus(response);

    console.info('[YouCam] Polled cloth task.', {
      taskId,
      attempt,
      maxAttempts,
      taskStatus
    });

    if (taskStatus === 'success') {
      console.info('[YouCam] Cloth task succeeded.', { taskId, attempt });
      return response;
    }

    if (taskStatus === 'error') {
      throw new Error(`Task failed: ${stringifyPayload(response)}`);
    }

    if (attempt < maxAttempts) {
      await sleepFn(intervalMs);
    }
  }

  throw new Error('Max attempts exceeded while polling');
};

export const uploadYouCamResultImage = async (imageUrl: string): Promise<string> => {
  try {
    console.info('[YouCam] Uploading generated result image to Supabase.', { imageUrl });
    const { uploadImageToTryOnBucket } = await import('./supabase');
    const publicUrl = await uploadImageToTryOnBucket(imageUrl, 'try-on-results');
    console.info('[YouCam] Generated result image stored.', { publicUrl });
    return publicUrl;
  } catch (uploadError) {
    console.error('Error uploading YouCam result to Supabase. Returning source URL as fallback.', uploadError);
    return imageUrl;
  }
};

export const runYouCamVirtualTryOn = async ({
  apiKey,
  fetcher = fetch,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
  payload = YOUCAM_SAMPLE_CLOTH_PAYLOAD,
  sleep: sleepFn = sleep,
  uploader = uploadYouCamResultImage
}: RunYouCamVirtualTryOnOptions): Promise<string> => {
  console.info('[YouCam] Running virtual try-on flow.');

  const taskId = await startYouCamClothTask({
    apiKey,
    fetcher,
    payload
  });
  const finalPayload = await pollYouCamClothTask(taskId, {
    apiKey,
    fetcher,
    intervalMs,
    maxAttempts,
    sleep: sleepFn
  });
  const resultUrl = extractYouCamResultUrl(finalPayload);

  if (!resultUrl) {
    throw new Error(`No result image URL found in response: ${stringifyPayload(finalPayload)}`);
  }

  console.info('[YouCam] Result URL extracted from task payload.', { resultUrl });

  return uploader(resultUrl);
};

const prepareYouCamInputUrl = async (
  imageSource: string,
  inputType: 'camera' | 'clothing'
): Promise<string> => {
  if (isPublicHttpUrl(imageSource)) {
    console.info('[YouCam] Input image already public.', {
      inputType,
      imageSource
    });

    return imageSource;
  }

  console.info('[YouCam] Uploading input image for public YouCam access.', {
    inputType,
    source: summarizeImageSource(imageSource)
  });

  const { uploadTryOnInputImage } = await import('./supabase');
  const publicUrl = await uploadTryOnInputImage(imageSource, inputType);

  console.info('[YouCam] Input image ready for YouCam.', {
    inputType,
    publicUrl
  });

  return publicUrl;
};

export const generateVirtualTryOn = async (request: TryOnRequest): Promise<string> => {
  try {
    console.info('[YouCam] Preparing virtual try-on inputs.', {
      userImage: summarizeImageSource(request.userImage),
      clothingImage: summarizeImageSource(request.clothingImage)
    });

    const [userImageUrl, clothingImageUrl] = await Promise.all([
      prepareYouCamInputUrl(request.userImage, 'camera'),
      prepareYouCamInputUrl(request.clothingImage, 'clothing')
    ]);

    const payload = buildYouCamClothPayload({
      userImageUrl,
      clothingImageUrl
    });

    console.info('[YouCam] Cloth payload built.', { payload });

    return await runYouCamVirtualTryOn({
      apiKey: YOUCAM_API_KEY,
      payload
    });
  } catch (error) {
    console.error('Error in generateVirtualTryOn:', error);
    throw new Error('Failed to generate virtual try-on result');
  }
};
