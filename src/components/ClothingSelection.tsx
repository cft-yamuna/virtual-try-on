import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ClothingItem } from '../types';

interface ClothingSelectionProps {
  userImage: string;
  clothingItems: ClothingItem[];
  onSelectClothing: (clothing: ClothingItem) => void;
  onBack: () => void;
}

export const ClothingSelection: React.FC<ClothingSelectionProps> = ({
  userImage,
  clothingItems,
  onSelectClothing
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <div className="bg-yellow-400 p-4">
      <div className="max-w-4xl mx-auto flex flex-col items-center">
        {/* User Image - Centered at 65% height */}
        <div className="w-full mb-4" style={{ height: '80vh' }}>
          <div className="w-full h-full rounded-2xl overflow-hidden flex items-center justify-center">
            <img
              src={userImage}
              alt="User"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>

        {/* Clothing Selection - Extra Large blocks */}
        <div className="w-full max-w-4xl">
          {/* Clothing Carousel */}
          <div className="flex gap-6 justify-center mb-6">
            {clothingItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setCurrentIndex(index)}
                className={`relative flex-shrink-0 w-56 h-64 rounded-2xl overflow-hidden border-4 transition-all duration-300 ${
                  currentIndex === index
                    ? 'border-white shadow-2xl scale-110'
                    : 'border-white/30 hover:border-white/60'
                }`}
              >
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2 text-left">
                  <div className="text-sm font-semibold text-white">{item.name}</div>
                  <div className="text-xs text-white/75">{item.category}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Try It On Button */}
          <div className="flex justify-center">
            <button
              onClick={() => onSelectClothing(clothingItems[currentIndex])}
              className="bg-black hover:bg-gray-800 text-white px-8 py-4 rounded-2xl font-semibold flex items-center gap-2 transition-all duration-300 hover:scale-105 shadow-lg"
            >
              <ArrowRight size={20} />
              Try It On
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
