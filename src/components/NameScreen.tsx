import React, { useState } from 'react';

interface NameScreenProps {
  onContinue: (name: string) => void;
}

export const NameScreen: React.FC<NameScreenProps> = ({ onContinue }) => {
  const [name, setName] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onContinue(name.trim());
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main
        className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/bg2.png')] bg-cover bg-center"
        aria-label="Enter your name"
      >
        <form onSubmit={handleSubmit} className="contents">
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Enter Your Name"
            aria-label="Enter your name"
            className="absolute left-[11.271%] top-[38.768%] h-[7.372%] w-[77.479%] rounded-[18px] border-0 bg-white px-[5.2%] text-[clamp(16px,2.9vh,32px)] font-bold text-black shadow-none outline-none placeholder:text-[#777777] focus:ring-4 focus:ring-white/40"
          />

          <button
            type="submit"
            className="absolute left-[11.271%] top-[64.896%] h-[7.372%] w-[77.479%] transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
          >
            <img
              src="/cont_bt.png"
              alt="Continue"
              className="block h-full w-full"
              draggable={false}
            />
          </button>
        </form>
      </main>
    </div>
  );
};
