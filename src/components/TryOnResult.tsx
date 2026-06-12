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
  onSharedResultCreated: (sharedResultUrl: string) => void;
  onShowQr: (value: string) => void;
}

const OUTPUT_IMAGE_WIDTH = 756;
const OUTPUT_IMAGE_HEIGHT = 1200;
const PRINT_PAGE_WIDTH_MM = 53.98;
const PRINT_PAGE_HEIGHT_MM = 85.72;
const PRINT_BLEED_MM = 2.4;

type FaceMask = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  neckTopY: number;
  neckBottomY: number;
  neckTopWidth: number;
  neckBottomWidth: number;
  sourceScale?: number;
  sourceOffsetX?: number;
  sourceOffsetY?: number;
};

const faceMasksByBaseImage: Record<string, FaceMask> = {
  'female1.png': {
    centerX: 0.502,
    centerY: 0.278,
    radiusX: 0.16,
    radiusY: 0.18,
    neckTopY: 0.365,
    neckBottomY: 0.47,
    neckTopWidth: 0.15,
    neckBottomWidth: 0.24
  },
  'female2.png': {
    centerX: 0.503,
    centerY: 0.278,
    radiusX: 0.162,
    radiusY: 0.18,
    neckTopY: 0.365,
    neckBottomY: 0.46,
    neckTopWidth: 0.15,
    neckBottomWidth: 0.24
  },
  'male1.jpg': {
    centerX: 0.502,
    centerY: 0.306,
    radiusX: 0.205,
    radiusY: 0.205,
    neckTopY: 0.405,
    neckBottomY: 0.505,
    neckTopWidth: 0.18,
    neckBottomWidth: 0.31,
    sourceScale: 0.985,
    sourceOffsetY: -0.004
  },
  'male2.png': {
    centerX: 0.502,
    centerY: 0.272,
    radiusX: 0.198,
    radiusY: 0.19,
    neckTopY: 0.365,
    neckBottomY: 0.5,
    neckTopWidth: 0.18,
    neckBottomWidth: 0.31,
    sourceScale: 0.985,
    sourceOffsetY: -0.004
  }
};

const getBaseImageName = (src: string) => {
  const cleanSrc = src.split('?')[0].split('#')[0];
  return cleanSrc.substring(cleanSrc.lastIndexOf('/') + 1);
};

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

const drawImageContain = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
) => {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  const drawWidth = imageRatio > canvasRatio ? canvasWidth : canvasHeight * imageRatio;
  const drawHeight = imageRatio > canvasRatio ? canvasWidth / imageRatio : canvasHeight;
  const drawX = (canvasWidth - drawWidth) / 2;
  const drawY = (canvasHeight - drawHeight) / 2;

  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
};

const drawImageCover = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  scale = 1,
  offsetX = 0,
  offsetY = 0
) => {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  const sourceWidth = imageRatio > canvasRatio ? image.naturalHeight * canvasRatio : image.naturalWidth;
  const sourceHeight = imageRatio > canvasRatio ? image.naturalHeight : image.naturalWidth / canvasRatio;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  const drawWidth = canvasWidth * scale;
  const drawHeight = canvasHeight * scale;
  const drawX = (canvasWidth - drawWidth) / 2 + offsetX * canvasWidth;
  const drawY = (canvasHeight - drawHeight) / 2 + offsetY * canvasHeight;

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);
};

const drawFacePatch = (
  context: CanvasRenderingContext2D,
  generatedImage: HTMLImageElement,
  baseImageSource: string,
  canvasWidth: number,
  canvasHeight: number
) => {
  const mask = faceMasksByBaseImage[getBaseImageName(baseImageSource)];
  if (!mask) {
    drawImageContain(context, generatedImage, canvasWidth, canvasHeight);
    return;
  }

  const faceLayer = document.createElement('canvas');
  faceLayer.width = canvasWidth;
  faceLayer.height = canvasHeight;

  const faceContext = faceLayer.getContext('2d');
  if (!faceContext) return;

  drawImageCover(
    faceContext,
    generatedImage,
    canvasWidth,
    canvasHeight,
    mask.sourceScale,
    mask.sourceOffsetX,
    mask.sourceOffsetY
  );
  const maskLayer = document.createElement('canvas');
  maskLayer.width = canvasWidth;
  maskLayer.height = canvasHeight;

  const maskContext = maskLayer.getContext('2d');
  if (!maskContext) return;

  const centerX = mask.centerX * canvasWidth;
  const centerY = mask.centerY * canvasHeight;
  const radiusX = mask.radiusX * canvasWidth;
  const radiusY = mask.radiusY * canvasHeight;

  const gradient = maskContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(radiusX, radiusY));
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.86, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  maskContext.fillStyle = gradient;
  maskContext.beginPath();
  maskContext.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  maskContext.fill();

  const neckTopY = mask.neckTopY * canvasHeight;
  const neckBottomY = mask.neckBottomY * canvasHeight;
  const neckTopHalfWidth = (mask.neckTopWidth * canvasWidth) / 2;
  const neckBottomHalfWidth = (mask.neckBottomWidth * canvasWidth) / 2;
  const neckFeather = Math.max(canvasWidth, canvasHeight) * 0.006;

  maskContext.filter = `blur(${neckFeather}px)`;
  maskContext.fillStyle = 'rgba(0, 0, 0, 1)';
  maskContext.beginPath();
  maskContext.moveTo(centerX - neckTopHalfWidth, neckTopY);
  maskContext.lineTo(centerX + neckTopHalfWidth, neckTopY);
  maskContext.lineTo(centerX + neckBottomHalfWidth, neckBottomY);
  maskContext.lineTo(centerX - neckBottomHalfWidth, neckBottomY);
  maskContext.closePath();
  maskContext.fill();
  maskContext.filter = 'none';

  faceContext.globalCompositeOperation = 'destination-in';
  faceContext.drawImage(maskLayer, 0, 0);
  faceContext.filter = 'none';

  context.drawImage(faceLayer, 0, 0);
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
  selectedClothing,
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

    const [base, result] = await Promise.all([
      selectedClothing ? loadImage(selectedClothing) : null,
      loadImage(resultImage)
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = base?.naturalWidth || OUTPUT_IMAGE_WIDTH;
    canvas.height = base?.naturalHeight || OUTPUT_IMAGE_HEIGHT;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create result image');
    }

    if (base) {
      context.drawImage(base, 0, 0, canvas.width, canvas.height);
      drawFacePatch(context, result, selectedClothing, canvas.width, canvas.height);
    } else {
      drawImageContain(context, result, canvas.width, canvas.height);
    }

    drawUserName(context, canvas.width, canvas.height, userName);

    return canvas.toDataURL('image/png');
  }, [resultImage, selectedClothing, userName]);

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

