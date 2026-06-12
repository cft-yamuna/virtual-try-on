import React, { useCallback, useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { removeImageBackground } from '../services/backgroundRemoval';
import { uploadSharedResultImage } from '../services/supabase';

interface TryOnResultProps {
  userImage: string;
  resultImage: string;
  isLoading: boolean;
  userName: string;
  onStartOver: () => void;
  onSharedResultCreated: (sharedResultUrl: string) => void;
  onShowQr: (value: string) => void;
}

const OUTPUT_IMAGE_WIDTH = 756;
const OUTPUT_IMAGE_HEIGHT = 1200;
const RESULT_BACKDROP_IMAGE = '/backdrop.png';
const FOREGROUND_SCALE = 1.2;
const FOREGROUND_OFFSET_Y = -0.07;
const PRINT_PAGE_WIDTH_MM = 53.98;
const PRINT_PAGE_HEIGHT_MM = 85.72;
const PRINT_BLEED_MM = 2.4;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const waitForPrintDialog = (printFrame: HTMLIFrameElement) =>
  new Promise<void>(resolve => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      printFrame.contentWindow?.removeEventListener('afterprint', finish);
      printFrame.remove();
      resolve();
    };

    printFrame.contentWindow?.addEventListener('afterprint', finish);
    printFrame.contentWindow?.focus();
    printFrame.contentWindow?.print();
    window.setTimeout(finish, 1000);
  });

const printSingleImage = async (imageSrc: string) => {
  const printFrame = document.createElement('iframe');
  printFrame.title = 'Print image';
  printFrame.style.position = 'fixed';
  printFrame.style.left = '-9999px';
  printFrame.style.top = '0';
  printFrame.style.width = '1px';
  printFrame.style.height = '1px';
  printFrame.style.border = '0';
  printFrame.style.opacity = '0';

  document.body.appendChild(printFrame);

  const printDocument = printFrame.contentDocument;
  if (!printDocument) {
    printFrame.remove();
    throw new Error('Unable to create print frame');
  }

  printDocument.open();
  printDocument.write(`<!doctype html>
    <html>
      <head>
        <style>
          @page {
            size: ${PRINT_PAGE_WIDTH_MM}mm ${PRINT_PAGE_HEIGHT_MM}mm;
            margin: 0;
          }

          html,
          body {
            width: ${PRINT_PAGE_WIDTH_MM}mm;
            height: ${PRINT_PAGE_HEIGHT_MM}mm;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #000;
          }

          img {
            display: block;
            position: fixed;
            left: -${PRINT_BLEED_MM * 0.35}mm;
            top: -${PRINT_BLEED_MM * 0.35}mm;
            width: ${PRINT_PAGE_WIDTH_MM + PRINT_BLEED_MM}mm;
            height: ${PRINT_PAGE_HEIGHT_MM + PRINT_BLEED_MM}mm;
            background: #000;
            object-fit: cover;
            break-inside: avoid;
            page-break-inside: avoid;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        </style>
      </head>
      <body>
        <img id="print-output" alt="Print output" />
      </body>
    </html>`);
  printDocument.close();

  const image = printDocument.querySelector<HTMLImageElement>('#print-output');
  if (image) {
    image.src = imageSrc;
  }

  if (image && !image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to load print image'));
    });
  }

  await waitForPrintDialog(printFrame);
};

const loadPosterFont = async () => {
  if (!document.fonts) return;

  await document.fonts.load('800 34px "Helvetica Now Display"');
};

const getContainRect = (
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
) => {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  const width = imageRatio > canvasRatio ? canvasWidth : canvasHeight * imageRatio;
  const height = imageRatio > canvasRatio ? canvasWidth / imageRatio : canvasHeight;

  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height
  };
};

const drawImageContain = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  scale = 1,
  offsetY = 0
) => {
  const rect = getContainRect(image, canvasWidth, canvasHeight);
  const scaledWidth = rect.width * scale;
  const scaledHeight = rect.height * scale;
  const scaledX = rect.x + (rect.width - scaledWidth) / 2;
  const scaledY = rect.y + (rect.height - scaledHeight) / 2 + canvasHeight * offsetY;

  context.drawImage(image, scaledX, scaledY, scaledWidth, scaledHeight);
};

const drawImageCover = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
) => {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  const sourceWidth = imageRatio > canvasRatio ? image.naturalHeight * canvasRatio : image.naturalWidth;
  const sourceHeight = imageRatio > canvasRatio ? image.naturalHeight : image.naturalWidth / canvasRatio;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvasWidth, canvasHeight);
};

const removePersonBackground = async (imageSource: string) => {
  console.info('[TryOnResult] Removing YouCam output background.');
  const foregroundBlob = await removeImageBackground(imageSource);
  const foregroundUrl = URL.createObjectURL(foregroundBlob);

  try {
    return await loadImage(foregroundUrl);
  } finally {
    URL.revokeObjectURL(foregroundUrl);
  }
};

const drawUserName = (context: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, userName: string) => {
  const displayName = userName.trim();
  if (!displayName) return;

  const maxWidth = canvasWidth * 0.72;
  const fontSize = 40;
  const paddingX = 26;
  const paddingY = 14;
  const textLeft = canvasWidth * 0.075;
  const textCenterY = canvasHeight * 0.943;

  context.font = `800 ${fontSize}px "Helvetica Now Display", Arial, sans-serif`;
  const textWidth = Math.min(context.measureText(displayName).width, maxWidth);
  const labelWidth = Math.max(canvasWidth * 0.42, textWidth + paddingX * 2);
  const labelHeight = fontSize + paddingY * 2;
  const labelLeft = Math.max(0, textLeft - paddingX);
  const labelTop = Math.min(canvasHeight - labelHeight, textCenterY - labelHeight / 2);

  context.fillStyle = '#000000';
  context.fillRect(labelLeft, labelTop, labelWidth, labelHeight);

  context.fillStyle = '#ED2024';
  context.textAlign = 'left';
  context.textBaseline = 'middle';

  context.fillText(displayName, textLeft, labelTop + labelHeight / 2, maxWidth);
};

export const TryOnResult: React.FC<TryOnResultProps> = ({
  resultImage,
  isLoading,
  userName,
  onSharedResultCreated,
  onShowQr
}) => {
  const [framedResultImage, setFramedResultImage] = useState('');
  const [isPreparingQr, setIsPreparingQr] = useState(false);
  const createNamedResultImage = useCallback(async () => {
    await loadPosterFont();

    const [backdrop, generatedPerson] = await Promise.all([
      loadImage(RESULT_BACKDROP_IMAGE),
      removePersonBackground(resultImage)
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_IMAGE_WIDTH;
    canvas.height = OUTPUT_IMAGE_HEIGHT;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create result image');
    }

    drawImageCover(context, backdrop, canvas.width, canvas.height);

    console.info('[TryOnResult] Compositing transparent YouCam output over backdrop.', {
      foregroundScale: FOREGROUND_SCALE,
      foregroundOffsetY: FOREGROUND_OFFSET_Y
    });
    drawImageContain(context, generatedPerson, canvas.width, canvas.height, FOREGROUND_SCALE, FOREGROUND_OFFSET_Y);

    drawUserName(context, canvas.width, canvas.height, userName);

    return canvas.toDataURL('image/png');
  }, [resultImage, userName]);

  const printSelectedSide = useCallback((imageSrc: string) => printSingleImage(imageSrc), []);

  const handlePrint = async () => {
    if (!resultImage || !framedResultImage || isPreparingQr) return;

    await printSelectedSide(framedResultImage);
  };

  const handleNext = async () => {
    if (!resultImage || !framedResultImage || isPreparingQr) return;

    setIsPreparingQr(true);

    try {
      const sharedResultUrl = await uploadSharedResultImage(framedResultImage);
      onSharedResultCreated(sharedResultUrl);
      onShowQr(sharedResultUrl);
    } catch (error) {
      console.error('Failed to upload shared result image:', error);
      onShowQr(framedResultImage || resultImage);
    } finally {
      setIsPreparingQr(false);
    }
  };

  const handlePrintBackAndContinue = async () => {
    if (!resultImage || !framedResultImage || isPreparingQr) return;

    let sharedResultUrl = framedResultImage;
    setIsPreparingQr(true);

    try {
      sharedResultUrl = await uploadSharedResultImage(framedResultImage);
      onSharedResultCreated(sharedResultUrl);
    } catch (error) {
      console.error('Failed to create shared result image:', error);
      sharedResultUrl = framedResultImage || resultImage;
    }

    try {
      await printSelectedSide('/Back.png');
      onShowQr(sharedResultUrl);
    } finally {
      setIsPreparingQr(false);
    }
  };

  useEffect(() => {
    if (!resultImage) {
      setFramedResultImage('');
      return;
    }

    let cancelled = false;

    void createNamedResultImage()
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
  }, [createNamedResultImage, resultImage]);

  if (isLoading || Boolean(resultImage && !framedResultImage)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
        <main className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/bg6.png')] bg-cover bg-center flex items-center justify-center">
          <div className="flex w-[76%] flex-col items-center justify-center">
            <h2 className="loading-title font-['Helvetica_Now_Display'] text-[clamp(28px,4.8vh,58px)] font-extrabold text-white">
              Creating Your Look
              <span className="loading-dot">.</span>
              <span className="loading-dot">.</span>
              <span className="loading-dot">.</span>
            </h2>
            <div className="loading-track mt-9 h-[10px] w-full max-w-[420px] overflow-hidden rounded-full bg-white/20">
              <div className="loading-scan h-full rounded-full bg-[#ffd914]" />
            </div>
            <div className="mt-6 flex items-center gap-3" aria-hidden="true">
              <span className="loading-pulse h-3 w-3 rounded-full bg-white" />
              <span className="loading-pulse h-3 w-3 rounded-full bg-[#ffd914]" />
              <span className="loading-pulse h-3 w-3 rounded-full bg-white" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/bg6.png')] bg-cover bg-center">
        <div className="absolute left-1/2 top-[23%] z-10 aspect-[756/1200] h-[62%] -translate-x-1/2">
          <img
            src={framedResultImage || resultImage}
            alt="Try-on result"
            className="block h-full w-full object-contain"
            draggable={false}
          />
        </div>

        <div className="hidden">
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
          disabled={!resultImage || !framedResultImage || isPreparingQr}
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
          disabled={!resultImage || !framedResultImage || isPreparingQr}
          className="no-print absolute right-[14%] top-[89.389%] z-30 h-[6.771%] w-[33%] overflow-hidden rounded-[122px] bg-[#ffd914] text-black font-['Helvetica_Now_Display'] text-[clamp(18px,3.4vh,46px)] font-extrabold leading-none transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          aria-label="Next"
        >
          <span className="flex h-full w-full items-center justify-center">Next</span>
        </button>

        <button
          type="button"
          onClick={handlePrintBackAndContinue}
          disabled={!resultImage || !framedResultImage || isPreparingQr}
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

