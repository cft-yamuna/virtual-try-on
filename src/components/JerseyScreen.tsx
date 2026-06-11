import React, { useState } from 'react';

type Gender = 'male' | 'female';
type Jersey = 'j1' | 'j2';

interface JerseyScreenProps {
  gender: Gender | null;
  onContinue: (jersey: Jersey) => void;
}

type JerseyOption = {
  value: Jersey;
  label: string;
  image: string;
  className: string;
};

const jerseyOptionsByGender: Record<Gender, JerseyOption[]> = {
  male: [
    {
      value: 'j1',
      label: 'Jersey 1',
      image: '/j1.png',
      className: 'left-[12.081%]'
    },
    {
      value: 'j2',
      label: 'Jersey 2',
      image: '/j2.png',
      className: 'left-[51.806%]'
    }
  ],
  female: [
    {
      value: 'j1',
      label: 'Jersey 1',
      image: '/fmale.png',
      className: 'left-[12.081%]'
    },
    {
      value: 'j2',
      label: 'Jersey 2',
      image: '/female.png',
      className: 'left-[51.806%]'
    }
  ]
};

export const JerseyScreen: React.FC<JerseyScreenProps> = ({ gender, onContinue }) => {
  const [selectedJersey, setSelectedJersey] = useState<Jersey>('j1');
  const jerseyOptions = jerseyOptionsByGender[gender || 'male'];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onContinue(selectedJersey);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main
        className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/jer.png')] bg-cover bg-center"
        aria-label="Choose your jersey"
      >
        <form onSubmit={handleSubmit} className="contents">
          <fieldset className="contents">
            <legend className="sr-only">Choose your jersey</legend>
            {jerseyOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedJersey(option.value)}
                aria-label={`Select ${option.label}`}
                aria-pressed={selectedJersey === option.value}
                className={`absolute top-[32.176%] h-[24.263%] w-[36.113%] overflow-hidden rounded-[15.23px] border-[5px] bg-transparent p-0 transition-transform duration-300 hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 ${
                  selectedJersey === option.value ? 'border-[#ffd914]' : 'border-white'
                } ${option.className}`}
              >
                <img
                  src={option.image}
                  alt=""
                  className="block h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </fieldset>

          <button
            type="submit"
            className="absolute left-[11.26%] top-[63.204%] h-[7.372%] w-[77.479%] overflow-hidden rounded-[120px] transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
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
