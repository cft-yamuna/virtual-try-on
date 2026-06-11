import React, { useState } from 'react';

type Gender = 'male' | 'female';

interface GenderScreenProps {
  onContinue: (gender: Gender) => void;
}

const genderOptions: Array<{
  value: Gender;
  label: string;
  image: string;
  className: string;
  labelClassName: string;
}> = [
  {
    value: 'male',
    label: 'Male',
    image: '/male.png',
    className: 'left-[14.448%]',
    labelClassName: 'left-[25.811%]'
  },
  {
    value: 'female',
    label: 'Female',
    image: '/female.png',
    className: 'left-[52.731%]',
    labelClassName: 'left-[64.094%]'
  }
];

export const GenderScreen: React.FC<GenderScreenProps> = ({ onContinue }) => {
  const [selectedGender, setSelectedGender] = useState<Gender>('male');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onContinue(selectedGender);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <main
        className="relative h-screen max-h-[calc(100vw*16/9)] w-screen max-w-[calc(100vh*9/16)] bg-[url('/bg3.png')] bg-cover bg-center"
        aria-label="Select your gender"
      >
        <form onSubmit={handleSubmit} className="contents">
          <fieldset className="contents">
            <legend className="sr-only">Select your gender</legend>
            {genderOptions.map(option => (
              <React.Fragment key={option.value}>
                <button
                  type="button"
                  onClick={() => setSelectedGender(option.value)}
                  aria-label={`Select ${option.label}`}
                  aria-pressed={selectedGender === option.value}
                  className={`absolute top-[32.176%] h-[22.362%] w-[33.283%] appearance-none overflow-hidden rounded-[15.23px] border-[5px] bg-transparent p-0 transition-transform duration-300 hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80 ${
                    selectedGender === option.value ? 'border-[#ffd914]' : 'border-white'
                  } ${option.className}`}
                >
                  <img
                    src={option.image}
                    alt=""
                    className="block h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-[54.538%] flex h-[2.865%] w-[10.556%] items-center justify-center text-center font-['Helvetica_Now_Display'] text-[30px] font-extrabold leading-none text-white ${option.labelClassName}`}
                >
                  {option.label}
                </span>
              </React.Fragment>
            ))}
          </fieldset>

          <button
            type="submit"
            className="absolute left-[11.111%] top-[63.073%] h-[7.372%] w-[77.5%] transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
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
