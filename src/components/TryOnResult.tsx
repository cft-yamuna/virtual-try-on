import React from 'react';
import { RotateCcw } from 'lucide-react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

interface TryOnResultProps {
  userImage: string;
  selectedClothing: string;
  resultImage: string;
  isLoading: boolean;
  onStartOver: () => void;
}

export const TryOnResult: React.FC<TryOnResultProps> = ({
  userImage,
  selectedClothing,
  resultImage,
  isLoading,
  onStartOver
}) => {
  if (isLoading) {
    return (
      <div className="min-h-screen bg-yellow-400 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20 text-center max-w-md">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
            <h2 className="text-2xl font-bold text-black mb-2">Processing ...</h2>
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yellow-400 p-4 flex items-center justify-center">
      <div className="w-full max-w-4xl text-center">
        {resultImage ? (
          <div className=" overflow-hidden">
            <img src={resultImage} alt="Try-on result" className="w-full h-auto object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-[3/4] flex items-center justify-center rounded-2xl bg-white/10">
            <div className="w-12 h-12 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
          </div>
        )}

        {resultImage && resultImage.startsWith('http') && (
          <div className="mt-6">
            <QRCode value={resultImage} size={128} />
          </div>
        )}

        <div className="flex justify-center mt-6 gap-4">
          <button
            onClick={onStartOver}
            className="bg-black hover:bg-gray-800 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all duration-300 hover:scale-105"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
};

