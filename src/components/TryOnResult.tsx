import React, { useCallback, useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { uploadSharedResultImage } from '../services/supabase';

interface TryOnResultProps {
  userImage: string;
  selectedClothing: string;
  resultImage: string;
  isLoading: boolean;
  userName: string;
  onStartOver: () => void;
  onShowQr: (value: string) => void;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const waitForNextPaint = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

const waitForPrintDialog = () =>
  new Promise<void>(resolve => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('afterprint', finish);
      resolve();
    };

    window.addEventListener('afterprint', finish);
    window.print();
    window.setTimeout(finish, 1000);
  });

const loadPosterFont = async () => {
  if (!document.fonts) return;

  await document.fonts.load('800 34px "Helvetica Now Display"');
};

const drawUserName = (context: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, userName: string) => {
  const displayName = userName.trim();
  if (!displayName) return;

  const maxWidth = canvasWidth * 0.72;
  const fontSize = 44;

  context.fillStyle = '#ED2024';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';

  context.font = `800 ${fontSize}px "Helvetica Now Display", Arial, sans-serif`;

  context.fillText(displayName, canvasWidth * 0.05, canvasHeight * 0.955);
};

const hasVisiblePixels = (pixels: Uint8ClampedArray) => {
  let visiblePixels = 0;

  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 10) {
      visiblePixels += 1;
    }
  }

  return visiblePixels / (pixels.length / 4) > 0.02;
};

const getVisibleBounds = (imageData: ImageData) => {
  const { data: pixels, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];

      if (alpha <= 20) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const padding = Math.round(Math.max(width, height) * 0.018);

  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(width - Math.max(0, minX - padding), maxX - minX + 1 + padding * 2),
    height: Math.min(height - Math.max(0, minY - padding), maxY - minY + 1 + padding * 2)
  };
};

const isGreenScreenPixel = (pixels: Uint8ClampedArray, pixelIndex: number) => {
  const offset = pixelIndex * 4;
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];

  return green > 80 && green > red * 1.12 && green > blue * 1.12 && green - Math.max(red, blue) > 20;
};

const isStrongGreenScreenPixel = (pixels: Uint8ClampedArray, pixelIndex: number) => {
  const offset = pixelIndex * 4;
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];

  return green > 115 && green > red * 1.3 && green > blue * 1.3 && green - Math.max(red, blue) > 45;
};

const isLightBackgroundPixel = (pixels: Uint8ClampedArray, pixelIndex: number) => {
  const offset = pixelIndex * 4;
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);

  return minChannel > 178 && maxChannel - minChannel < 58;
};

const isGeneratedBackgroundPixel = (pixels: Uint8ClampedArray, pixelIndex: number) =>
  isGreenScreenPixel(pixels, pixelIndex) || isLightBackgroundPixel(pixels, pixelIndex);

const removeGeneratedBackground = (imageData: ImageData) => {
  const { data: pixels, width, height } = imageData;
  const pixelCount = width * height;
  const backgroundMask = new Uint8Array(pixelCount);
  const queue: number[] = [];
  let queueIndex = 0;

  const addPixel = (pixelIndex: number) => {
    if (backgroundMask[pixelIndex] || !isGeneratedBackgroundPixel(pixels, pixelIndex)) return;

    backgroundMask[pixelIndex] = 1;
    queue.push(pixelIndex);
  };

  for (let x = 0; x < width; x += 1) {
    addPixel(x);
    addPixel((height - 1) * width + x);
  }

  for (let y = 1; y < height - 1; y += 1) {
    addPixel(y * width);
    addPixel(y * width + width - 1);
  }

  while (queueIndex < queue.length) {
    const pixelIndex = queue[queueIndex];
    queueIndex += 1;

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (x > 0) addPixel(pixelIndex - 1);
    if (x < width - 1) addPixel(pixelIndex + 1);
    if (y > 0) addPixel(pixelIndex - width);
    if (y < height - 1) addPixel(pixelIndex + width);
  }

  const visited = new Uint8Array(pixelCount);
  const component: number[] = [];
  const componentQueue: number[] = [];
  const minFloatingGreenSize = Math.max(18, Math.floor(pixelCount * 0.00003));

  const addComponentPixel = (pixelIndex: number) => {
    if (
      visited[pixelIndex] ||
      backgroundMask[pixelIndex] ||
      !isStrongGreenScreenPixel(pixels, pixelIndex)
    ) {
      return;
    }

    visited[pixelIndex] = 1;
    componentQueue.push(pixelIndex);
    component.push(pixelIndex);
  };

  for (let startIndex = 0; startIndex < pixelCount; startIndex += 1) {
    if (visited[startIndex] || backgroundMask[startIndex] || !isStrongGreenScreenPixel(pixels, startIndex)) {
      continue;
    }

    component.length = 0;
    componentQueue.length = 0;
    let componentQueueIndex = 0;
    addComponentPixel(startIndex);

    while (componentQueueIndex < componentQueue.length) {
      const pixelIndex = componentQueue[componentQueueIndex];
      componentQueueIndex += 1;

      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);

      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          if (xOffset === 0 && yOffset === 0) continue;

          const nextX = x + xOffset;
          const nextY = y + yOffset;

          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          addComponentPixel(nextY * width + nextX);
        }
      }
    }

    if (component.length >= minFloatingGreenSize) {
      for (const pixelIndex of component) {
        backgroundMask[pixelIndex] = 1;
      }
    }
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;

    if (backgroundMask[pixelIndex]) {
      pixels[offset + 3] = 0;
      continue;
    }

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    let touchesRemovedBackground = false;

    for (let yOffset = -1; yOffset <= 1 && !touchesRemovedBackground; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        if (xOffset === 0 && yOffset === 0) continue;

        const nextX = x + xOffset;
        const nextY = y + yOffset;

        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;

        if (backgroundMask[nextY * width + nextX]) {
          touchesRemovedBackground = true;
          break;
        }
      }
    }

    if (!touchesRemovedBackground) continue;

    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const strongestNonGreen = Math.max(red, blue);
    const greenSpill = green - strongestNonGreen;

    if (greenSpill > 8) {
      pixels[offset + 1] = Math.min(green, strongestNonGreen + 8);
    }

    if (greenSpill > 22 && green > 70) {
      const spillStrength = Math.min((greenSpill - 22) / 95, 1);
      pixels[offset + 3] = Math.round(pixels[offset + 3] * (1 - spillStrength * 0.7));
    }
  }
};

export const TryOnResult: React.FC<TryOnResultProps> = ({
  userImage,
  selectedClothing,
  resultImage,
  isLoading,
  userName,
  onShowQr
}) => {
  const [processedResultImage, setProcessedResultImage] = useState('');
  const [framedResultImage, setFramedResultImage] = useState('');
  const [isPreparingQr, setIsPreparingQr] = useState(false);
  const [printMode, setPrintMode] = useState<'front' | 'back'>('front');

  const createFramedResultImage = useCallback(async () => {
    await loadPosterFont();

    const frame = await loadImage('/frameog.png');
    const result = await loadImage(processedResultImage || resultImage);
    const canvas = document.createElement('canvas');
    canvas.width = frame.naturalWidth;
    canvas.height = frame.naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create result image');
    }

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = result.naturalWidth;
    resultCanvas.height = result.naturalHeight;

    const resultContext = resultCanvas.getContext('2d');
    resultContext?.drawImage(result, 0, 0);

    const resultBounds = resultContext
      ? getVisibleBounds(resultContext.getImageData(0, 0, resultCanvas.width, resultCanvas.height))
      : null;

    const sourceX = resultBounds?.x ?? 0;
    const sourceY = resultBounds?.y ?? 0;
    const sourceWidth = resultBounds?.width ?? result.naturalWidth;
    const sourceHeight = resultBounds?.height ?? result.naturalHeight;
    const targetWidth = Math.min(980, canvas.width);
    const targetHeight = Math.min(1260, canvas.height);
    const targetLeft = (canvas.width - targetWidth) / 2;
    const targetTop = canvas.height * 0.15;
    const imageRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;

    let drawWidth = targetWidth;
    let drawHeight = targetHeight;
    let drawLeft = targetLeft;
    let drawTop = targetTop;

    if (imageRatio > targetRatio) {
      drawHeight = targetWidth / imageRatio;
      drawTop = targetTop + (targetHeight - drawHeight) / 2;
    } else {
      drawWidth = targetHeight * imageRatio;
      drawLeft = targetLeft + (targetWidth - drawWidth) / 2;
    }

    context.fillStyle = '#020205';
    context.fillRect(0, canvas.height * 0.165, canvas.width, canvas.height * 0.745);
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);

    context.drawImage(
      result,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      drawLeft,
      drawTop,
      drawWidth,
      drawHeight
    );
    drawUserName(context, canvas.width, canvas.height, userName);

    return canvas.toDataURL('image/png');
  }, [processedResultImage, resultImage, userName]);

  const printSelectedSide = useCallback(async (mode: 'front' | 'back') => {
    setPrintMode(mode);
    await waitForNextPaint();
    await waitForPrintDialog();
    setPrintMode('front');
  }, []);

  const handlePrint = async () => {
    if (!resultImage || !processedResultImage || !framedResultImage || isPreparingQr) return;

    await printSelectedSide('front');
  };

  const handleNext = async () => {
    if (!resultImage || !processedResultImage || !framedResultImage || isPreparingQr) return;

    setIsPreparingQr(true);

    try {
      const sharedResultUrl = await uploadSharedResultImage(framedResultImage);
      onShowQr(sharedResultUrl);
    } catch (error) {
      console.error('Failed to upload shared result image:', error);
      onShowQr(processedResultImage || resultImage);
    } finally {
      setIsPreparingQr(false);
    }
  };

  const handlePrintBackAndContinue = async () => {
    if (!resultImage || !processedResultImage || !framedResultImage || isPreparingQr) return;

    let sharedResultUrl = framedResultImage;
    setIsPreparingQr(true);

    try {
      sharedResultUrl = await uploadSharedResultImage(framedResultImage);
    } catch (error) {
      console.error('Failed to create shared result image:', error);
      sharedResultUrl = processedResultImage || resultImage;
    }

    try {
      await printSelectedSide('back');
      onShowQr(sharedResultUrl);
    } finally {
      setIsPreparingQr(false);
    }
  };

  useEffect(() => {
    if (!resultImage) {
      setProcessedResultImage('');
      setFramedResultImage('');
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      if (cancelled) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext('2d');
        if (!context) {
          setProcessedResultImage(resultImage);
          return;
        }

        context.drawImage(image, 0, 0);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        removeGeneratedBackground(imageData);

        context.putImageData(imageData, 0, 0);
        setProcessedResultImage(hasVisiblePixels(pixels) ? canvas.toDataURL('image/png') : resultImage);
      } catch (error) {
        console.error('Failed to remove generated green background:', error);
        setProcessedResultImage(resultImage);
      }
    };

    image.onerror = () => {
      if (!cancelled) {
        setProcessedResultImage(resultImage);
      }
    };

    image.src = resultImage;

    return () => {
      cancelled = true;
    };
  }, [resultImage]);

  useEffect(() => {
    if (!processedResultImage || !resultImage) {
      setFramedResultImage('');
      return;
    }

    let cancelled = false;

    void createFramedResultImage()
      .then(async image => {
        await loadImage(image);

        if (!cancelled) {
          setFramedResultImage(image);
        }
      })
      .catch(error => {
        console.error('Failed to create framed result preview:', error);
        if (!cancelled) {
          setFramedResultImage('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [createFramedResultImage, processedResultImage, resultImage]);

  if (isLoading || Boolean(resultImage && !framedResultImage)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
        <main className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/bg6.png')] bg-cover bg-center flex items-center justify-center">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20 text-center max-w-md">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto mb-4 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
              <h2 className="text-2xl font-bold text-white mb-2">Processing ...</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="aspect-square rounded-xl overflow-hidden">
                <img src={userImage} alt="Original" className="w-full h-full object-cover" />
              </div>
              <div className="aspect-square rounded-xl overflow-hidden">
                <img src={selectedClothing} alt="Clothing" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/bg6.png')] bg-cover bg-center">
        <div className={`${printMode === 'front' ? 'print-target ' : ''}absolute left-1/2 top-[23%] z-10 aspect-[750/1200] h-[62%] -translate-x-1/2`}>
          <img
            src={framedResultImage || '/frameog.png'}
            alt="Try-on result"
            className="block h-full w-full object-contain"
            draggable={false}
          />
        </div>

        <div className={`${printMode === 'back' ? 'print-target ' : ''}hidden`}>
          <img
            src="/Back.png"
            alt="Back print"
            className="block h-full w-full object-contain"
            draggable={false}
          />
        </div>

        <button
          type="button"
          onClick={handlePrint}
          disabled={!resultImage || !processedResultImage || !framedResultImage || isPreparingQr}
          className="no-print absolute left-[14%] top-[89.389%] z-30 h-[6.771%] w-[33%] overflow-hidden rounded-[122px] transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          aria-label="Print result"
        >
          <img
            src="/print_bt.png"
            alt="Print"
            className="block h-full w-full"
            draggable={false}
          />
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!resultImage || !processedResultImage || !framedResultImage || isPreparingQr}
          className="no-print absolute right-[14%] top-[89.389%] z-30 h-[6.771%] w-[33%] overflow-hidden rounded-[122px] bg-[#ffd914] text-black font-['Helvetica_Now_Display'] text-[clamp(20px,4vh,54px)] font-extrabold leading-none transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          aria-label="Next"
        >
          <span className="flex h-full w-full items-center justify-center">NEXT</span>
        </button>

        <button
          type="button"
          onClick={handlePrintBackAndContinue}
          disabled={!resultImage || !processedResultImage || !framedResultImage || isPreparingQr}
          className="no-print absolute bottom-[1.5%] right-[1.5%] z-30 flex h-[4%] aspect-square items-center justify-center rounded-full bg-white text-black opacity-0 transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 disabled:cursor-not-allowed"
          aria-label="Print back and continue"
          title="Print back and continue"
        >
          <Settings className="h-[48%] w-[48%]" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </main>
    </div>
  );
};

