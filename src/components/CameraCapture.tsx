import React, { useRef, useCallback, useState, useEffect } from 'react';

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
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main
        className={`relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-cover bg-center ${
          capturedImage ? "bg-[url('/bg5.png')]" : "bg-[url('/bg4.png')]"
        }`}
        aria-label="Capture your photo"
      >
        {!capturedImage ? (
          <>
            <div className="absolute left-[8.056%] top-[21.771%] h-[59.635%] w-[82.963%] overflow-hidden bg-black">
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
            </div>

            <button
              onClick={startCaptureCountdown}
              disabled={!isStreaming || countdown !== null}
              className="absolute left-[11.574%] top-[86.406%] h-[7.372%] w-[77.479%] overflow-hidden rounded-[120px] transition-transform duration-300 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
              aria-label="Capture photo"
            >
              <img
                src="/capture_bt.png"
                alt="Capture"
                className="block h-full w-full"
                draggable={false}
              />
            </button>
          </>
        ) : (
          <>
            <div className="absolute left-[8.056%] top-[21.771%] h-[59.635%] w-[82.963%] overflow-hidden bg-black">
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-cover"
              />
            </div>

            <button
              onClick={retakePhoto}
              className="absolute left-[8.056%] top-[85.417%] h-[6.771%] w-[36.204%] overflow-hidden rounded-[122px] transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
              aria-label="Retake photo"
            >
              <img
                src="/retake_bt.png"
                alt="Retake"
                className="block h-full w-full"
                draggable={false}
              />
            </button>

            <button
              onClick={confirmPhoto}
              className="absolute left-[55.741%] top-[85.417%] h-[6.771%] w-[36.204%] overflow-hidden rounded-[122px] transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
              aria-label="Submit photo"
            >
              <img
                src="/sub_bt.png"
                alt="Submit"
                className="block h-full w-full"
                draggable={false}
              />
            </button>
          </>
        )}
      </main>
    </div>
  );
};
