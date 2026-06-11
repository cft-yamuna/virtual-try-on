import React from 'react';

interface HomeScreenProps {
  onGetStarted: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main
        className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/bg1.png')] bg-cover bg-center"
        aria-label="Virtual try-on home screen"
      >
        <button
          onClick={onGetStarted}
          className="absolute left-[11.204%] top-[62.969%] h-[7.372%] w-[77.479%] transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
        >
          <img
            src="/start_bt.png"
            alt="Start"
            className="block h-full w-full"
            draggable={false}
          />
        </button>
      </main>
    </div>
  );
};
