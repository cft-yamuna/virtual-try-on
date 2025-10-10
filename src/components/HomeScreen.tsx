import React from 'react';

interface HomeScreenProps {
  onGetStarted: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-yellow-400 flex flex-col items-center justify-center text-center p-4">
      <h1 className="text-6xl font-bold text-black mb-4">Virtual Try-On</h1>
      <p className="text-xl text-black mb-8">See yourself in new outfits instantly.</p>
      <button
        onClick={onGetStarted}
        className="bg-black hover:bg-gray-800 text-white px-8 py-4 rounded-xl text-2xl font-bold transition-all duration-300 hover:scale-105"
      >
        Get Started
      </button>
    </div>
  );
};
