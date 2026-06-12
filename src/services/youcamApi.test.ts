import { describe, expect, it, vi } from 'vitest';
import {
  buildYouCamClothPayload,
  extractYouCamResultUrl,
  pollYouCamClothTask,
  runYouCamVirtualTryOn,
  startYouCamClothTask
} from './youcamApi';

const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('YouCam cloth task API', () => {
  it('builds a cloth payload from the camera capture URL and selected jersey URL', () => {
    expect(
      buildYouCamClothPayload({
        userImageUrl: 'https://storage.example.com/captured.jpg',
        clothingImageUrl: 'https://storage.example.com/jersey.png'
      })
    ).toEqual({
      src_file_url: 'https://storage.example.com/captured.jpg',
      ref_file_url: 'https://storage.example.com/jersey.png',
      garment_category: 'upper_body'
    });
  });

  it('starts a cloth task with the supplied payload and bearer token', async () => {
    const payload = buildYouCamClothPayload({
      userImageUrl: 'https://storage.example.com/captured.jpg',
      clothingImageUrl: 'https://storage.example.com/jersey.png'
    });
    const fetcher = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          task_id: 'task-123'
        }
      })
    );

    const taskId = await startYouCamClothTask({
      apiKey: 'test-key',
      fetcher,
      payload
    });

    expect(taskId).toBe('task-123');
    expect(fetcher).toHaveBeenCalledWith(
      'https://yce-api-01.makeupar.com/s2s/v3.0/task/cloth',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key'
        },
        body: JSON.stringify(payload)
      }
    );
  });

  it('polls until the task succeeds and returns the final payload', async () => {
    const pendingPayload = {
      data: {
        task_status: 'running'
      }
    };
    const successPayload = {
      data: {
        task_status: 'success',
        results: {
          url: 'https://cdn.example.com/result.png'
        }
      }
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(pendingPayload))
      .mockResolvedValueOnce(createJsonResponse(successPayload));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const payload = await pollYouCamClothTask('task-123', {
      apiKey: 'test-key',
      fetcher,
      sleep,
      intervalMs: 25,
      maxAttempts: 2
    });

    expect(payload).toEqual(successPayload);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://yce-api-01.makeupar.com/s2s/v3.0/task/cloth/task-123',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key'
        }
      }
    );
    expect(sleep).toHaveBeenCalledWith(25);
  });

  it('throws when YouCam reports a task error', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          task_status: 'error',
          error: 'bad input'
        }
      })
    );

    await expect(
      pollYouCamClothTask('task-123', {
        apiKey: 'test-key',
        fetcher,
        sleep: vi.fn(),
        maxAttempts: 1
      })
    ).rejects.toThrow('Task failed');
  });

  it('extracts the result image URL from the YouCam success payload', () => {
    expect(
      extractYouCamResultUrl({
        data: {
          results: {
            url: 'https://cdn.example.com/result.png'
          }
        }
      })
    ).toBe('https://cdn.example.com/result.png');

    expect(
      extractYouCamResultUrl({
        data: {
          results: [
            {
              image_url: 'https://cdn.example.com/result-array.png'
            }
          ]
        }
      })
    ).toBe('https://cdn.example.com/result-array.png');
  });

  it('runs the full task flow and returns the uploaded result image URL', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            task_id: 'task-123'
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            task_status: 'success',
            results: {
              url: 'https://cdn.example.com/result.png'
            }
          }
        })
      );
    const payload = buildYouCamClothPayload({
      userImageUrl: 'https://storage.example.com/captured.jpg',
      clothingImageUrl: 'https://storage.example.com/jersey.png'
    });
    const uploader = vi.fn().mockResolvedValue('https://storage.example.com/result.png');

    const resultUrl = await runYouCamVirtualTryOn({
      apiKey: 'test-key',
      fetcher,
      sleep: vi.fn(),
      payload,
      uploader
    });

    expect(resultUrl).toBe('https://storage.example.com/result.png');
    expect(uploader).toHaveBeenCalledWith('https://cdn.example.com/result.png');
  });
});
