import { removeBackground, type Config as BackgroundRemovalConfig } from '@imgly/background-removal';

export type BackgroundRemovalProvider = 'imgly' | 'clippingmagic';

const BACKGROUND_REMOVAL_PROVIDER = import.meta.env.VITE_BACKGROUND_REMOVAL_PROVIDER;

const BACKGROUND_REMOVAL_CONFIG: BackgroundRemovalConfig = {
  model: 'isnet_quint8',
  output: {
    format: 'image/png',
    quality: 1,
    type: 'foreground'
  },
  progress: (key, current, total) => {
    console.info('[BackgroundRemoval] IMG.LY asset progress.', {
      key,
      current,
      total
    });
  }
};

const isPublicHttpUrl = (imageSource: string) => /^https?:\/\//i.test(imageSource);

export const getBackgroundRemovalProvider = (
  value: string | undefined
): BackgroundRemovalProvider => {
  return value?.trim().toLowerCase() === 'clippingmagic' ? 'clippingmagic' : 'imgly';
};

export const removeBackgroundWithImgly = (imageSource: string): Promise<Blob> => {
  console.info('[BackgroundRemoval] Removing background with IMG.LY browser model.');
  return removeBackground(imageSource, BACKGROUND_REMOVAL_CONFIG);
};

export const removeBackgroundWithClippingMagic = async (
  imageSource: string,
  fetcher: typeof fetch = fetch
): Promise<Blob> => {
  if (!isPublicHttpUrl(imageSource)) {
    throw new Error('ClippingMagic background removal requires a public image URL.');
  }

  console.info('[BackgroundRemoval] Removing background with ClippingMagic.', {
    imageSource
  });

  const response = await fetcher('/api/background-removal/clippingmagic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      imageUrl: imageSource
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClippingMagic background removal failed: ${response.status} ${errorText}`);
  }

  return response.blob();
};

export const removeImageBackground = (
  imageSource: string,
  provider = getBackgroundRemovalProvider(BACKGROUND_REMOVAL_PROVIDER)
): Promise<Blob> => {
  if (provider === 'clippingmagic') {
    return removeBackgroundWithClippingMagic(imageSource);
  }

  return removeBackgroundWithImgly(imageSource);
};
