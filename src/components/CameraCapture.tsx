import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Camera, RotateCcw, CheckCircle } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current?.getVideoTracks().some(track => track.readyState === 'live')) {
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
        setIsStreaming(true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 1920,
          height: 1080,
          facingMode: 'user'
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsStreaming(true);
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('Unable to access camera. Please ensure camera permissions are granted.');
    }
  }, []);

  useEffect(() => {
    if (!capturedImage) {
      void startCamera();
    }
  }, [capturedImage, startCamera]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
      }
      stopCamera();
    };
  }, [stopCamera]);

  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Get the displayed dimensions of the video element
        const videoElement = videoRef.current;
        const displayedWidth = videoElement.clientWidth;
        const displayedHeight = videoElement.clientHeight;

        // Get video's natural dimensions
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // Calculate the scale and crop dimensions to maintain aspect ratio
        const displayAspect = displayedWidth / displayedHeight;
        const videoAspect = videoWidth / videoHeight;

        let sourceX = 0, sourceY = 0, sourceWidth = videoWidth, sourceHeight = videoHeight;

        if (videoAspect > displayAspect) {
          // Video is wider, crop horizontally
          sourceWidth = videoHeight * displayAspect;
          sourceX = (videoWidth - sourceWidth) / 2;
        } else {
          // Video is taller, crop vertically
          sourceHeight = videoWidth / displayAspect;
          sourceY = (videoHeight - sourceHeight) / 2;
        }

        // Set canvas to match displayed dimensions
        canvas.width = displayedWidth;
        canvas.height = displayedHeight;

        // Draw the cropped video
        context.drawImage(
          video,
          sourceX, sourceY, sourceWidth, sourceHeight,
          0, 0, displayedWidth, displayedHeight
        );

        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageData);
      }
    }
  }, []);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    setCountdown(null);
  }, []);

  const startCaptureCountdown = useCallback(() => {
    if (!isStreaming || countdown !== null) return;

    setCountdown(3);

    countdownTimerRef.current = window.setInterval(() => {
      setCountdown(current => {
        if (current === null) return null;

        if (current <= 1) {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }

          captureImage();
          return null;
        }

        return current - 1;
      });
    }, 1000);
  }, [captureImage, countdown, isStreaming]);

  const confirmPhoto = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage);
      stopCamera();
    }
  }, [capturedImage, onCapture, stopCamera]);

  return (
    <div className="fixed inset-0 bg-yellow-400 p-[50px]">
      <div className="w-full h-full relative">
        {!capturedImage ? (
          <div className="relative w-full h-full  overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="text-white text-8xl font-bold drop-shadow-lg tabular-nums">
                  {countdown}
                </div>
              </div>
            )}

            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
              <button
                onClick={startCaptureCountdown}
                disabled={!isStreaming || countdown !== null}
                className="bg-black hover:bg-gray-800 disabled:bg-gray-700 disabled:cursor-not-allowed text-white w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 disabled:hover:scale-100 shadow-lg"
                aria-label="Capture photo"
              >
                <Camera size={28} />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            <div className="flex-1 rounded-2xl overflow-hidden mb-6">
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex gap-4 px-8 pb-8">
              <button
                onClick={retakePhoto}
                className="flex-1 bg-black hover:bg-gray-800 text-white py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all duration-300"
              >
                <RotateCcw size={20} />
                Retake
              </button>
              <button
                onClick={confirmPhoto}
                className="flex-1 bg-black hover:bg-gray-800 text-white py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105"
              >
                <CheckCircle size={20} />
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
