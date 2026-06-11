import React from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

interface QrScreenProps {
  value: string;
  onRestart: () => void;
}

export const QrScreen: React.FC<QrScreenProps> = ({ value, onRestart }) => {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main
        onClick={onRestart}
        onTouchEnd={onRestart}
        className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/qr.png')] bg-cover bg-center"
        aria-label="Result QR code"
      >
        <div className="absolute left-[7.083%] top-[29.913%] flex h-[25.056%] w-[44.543%] items-center justify-center rounded-[8px] border-[8px] border-[#ffd914] bg-white p-[2.2%]">
          <QRCode value={value || window.location.href} className="h-full w-full" />
        </div>
      </main>
    </div>
  );
};
