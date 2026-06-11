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
  const fontSize = 64;
  const paddingX = 38;
  const paddingY = 22;
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
  const [printMode, setPrintMode] = useState<'front' | 'back'>('front');

  const createNamedResultImage = useCallback(async () => {
    await loadPosterFont();

    const result = await loadImage(resultImage);
    const canvas = document.createElement('canvas');
    canvas.width = result.naturalWidth;
    canvas.height = result.naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create result image');
    }

    context.drawImage(result, 0, 0);
    drawUserName(context, canvas.width, canvas.height, userName);

    return canvas.toDataURL('image/png');
  }, [resultImage, userName]);

  const printSelectedSide = useCallback(async (mode: 'front' | 'back') => {
    setPrintMode(mode);
    await waitForNextPaint();
    await waitForPrintDialog();
    setPrintMode('front');
  }, []);

  const handlePrint = async () => {
    if (!resultImage || !framedResultImage || isPreparingQr) return;

    await printSelectedSide('front');
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
      await printSelectedSide('back');
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
        <div className={`${printMode === 'front' ? 'print-target ' : ''}absolute left-1/2 top-[23%] z-10 aspect-[750/1200] h-[62%] -translate-x-1/2`}>
          <img
            src={framedResultImage || resultImage}
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

