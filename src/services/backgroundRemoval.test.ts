import { describe, expect, it, vi } from 'vitest';
import {
  getBackgroundRemovalProvider,
  removeBackgroundWithClippingMagic
} from './backgroundRemoval';

describe('background removal provider selection', () => {
  it('defaults to imgly when no provider is configured', () => {
    expect(getBackgroundRemovalProvider(undefined)).toBe('imgly');
  });

  it('selects clippingmagic when configured', () => {
    expect(getBackgroundRemovalProvider('clippingmagic')).toBe('clippingmagic');
  });

  it('falls back to imgly for unknown provider values', () => {
    expect(getBackgroundRemovalProvider('unknown')).toBe('imgly');
  });
});

describe('ClippingMagic background removal client', () => {
  it('posts the public image URL to the local server endpoint and returns the PNG blob', async () => {
    const resultBlob = new Blob(['png'], { type: 'image/png' });
    const fetcher = vi.fn().mockResolvedValue(
      new Response(resultBlob, {
        status: 200,
        headers: {
          'Content-Type': 'image/png'
        }
      })
    );

    const blob = await removeBackgroundWithClippingMagic(
      'https://storage.example.com/result.png',
      fetcher
    );

    expect(blob.type).toBe('image/png');
    expect(fetcher).toHaveBeenCalledWith('/api/background-removal/clippingmagic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageUrl: 'https://storage.example.com/result.png'
      })
    });
  });

  it('requires a public URL for ClippingMagic', async () => {
    await expect(
      removeBackgroundWithClippingMagic('data:image/png;base64,abc', vi.fn())
    ).rejects.toThrow('public image URL');
  });
});
