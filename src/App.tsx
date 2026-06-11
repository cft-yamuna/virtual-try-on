import React, { useState } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { NameScreen } from './components/NameScreen';
import { GenderScreen } from './components/GenderScreen';
import { JerseyScreen } from './components/JerseyScreen';
import { CameraCapture } from './components/CameraCapture';
import { TryOnResult } from './components/TryOnResult';
import { QrScreen } from './components/QrScreen';
import { generateVirtualTryOn } from './services/geminiApi';
import { uploadCapturedImage } from './services/supabase';
import { AppState } from './types';

const jerseyGeneration = {
  male: {
    j1: {
      id: 'try-on-j1',
      name: 'Jersey 1',
      imageUrl: '/jog.png',
      category: 'Jersey',
      generationMode: 'tryOn' as const,
      poseImageUrl: '/male_j2.png',
      promptVariant: 'maleJ1ThreeReference' as const
    },
    j2: {
      id: 'try-on-j2',
      name: 'Blue Jersey',
      imageUrl: '/male_j2.png',
      category: 'Jersey',
      generationMode: 'tryOn' as const,
      composition: 'closePortrait' as const
    }
  },
  female: {
    j1: {
      id: 'try-on-female-j1',
      name: 'Female Jersey 1',
      imageUrl: '/jog.png',
      category: 'Jersey',
      generationMode: 'tryOn' as const,
      promptVariant: 'femaleJ1ThreeReference' as const
    },
    j2: {
      id: 'try-on-female-j2',
      name: 'Female Jersey 2',
      imageUrl: '/fmale2.png',
      category: 'Jersey',
      generationMode: 'tryOn' as const
    }
  }
};

const fallbackGeneration = {
  id: 'try-on-j1',
  name: 'Jersey 1',
  imageUrl: '/image.png',
  category: 'Jersey',
  generationMode: 'tryOn' as const
};

function App() {
  const [appState, setAppState] = useState<AppState>({
    currentStep: 'home',
    userName: '',
    gender: null,
    selectedJersey: null,
    userImage: null,
    selectedClothing: null,
    resultImage: null,
    qrValue: null,
    isLoading: false
  });

  const handleGetStarted = () => {
    setAppState(prev => ({ ...prev, currentStep: 'name' }));
  };

  const handleNameContinue = (name: string) => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'gender',
      userName: name
    }));
  };

  const handleGenderContinue = (gender: 'male' | 'female') => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'jersey',
      gender
    }));
  };

  const handleJerseyContinue = (selectedJersey: 'j1' | 'j2') => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'capture',
      selectedJersey
    }));
  };

  const handleImageCapture = async (imageData: string) => {
    const selectedGender = appState.gender || 'male';
    const selectedJersey = appState.selectedJersey || 'j1';
    const selectedClothing = jerseyGeneration[selectedGender]?.[selectedJersey] || fallbackGeneration;

    setAppState(prev => ({
      ...prev,
      currentStep: 'result',
      userImage: imageData,
      selectedClothing,
      resultImage: null,
      qrValue: null,
      isLoading: true
    }));

    void uploadCapturedImage(imageData)
      .then(publicUrl => {
        console.log('Captured image uploaded to:', publicUrl);
      })
      .catch(error => {
        console.error('Failed to upload captured image:', error);
      });

    try {
      const resultImage = await generateVirtualTryOn({
        userImage: imageData,
        clothingImage: selectedClothing.imageUrl,
        mode: selectedClothing.generationMode,
        composition: selectedClothing.composition,
        poseImage: selectedClothing.poseImageUrl,
        promptVariant: selectedClothing.promptVariant
      });

      setAppState(prev => ({
        ...prev,
        resultImage,
        isLoading: false
      }));
    } catch (error) {
      console.error('Failed to generate try-on result:', error);
      setAppState(prev => ({
        ...prev,
        isLoading: false
      }));
      alert('Failed to generate try-on result. Please try again.');
    }
  };

  const handleStartOver = () => {
    setAppState({
      currentStep: 'home',
      userName: '',
      gender: null,
      selectedJersey: null,
      userImage: null,
      selectedClothing: null,
      resultImage: null,
      qrValue: null,
      isLoading: false
    });
  };

  const handleShowQr = (qrValue: string) => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'qr',
      qrValue
    }));
  };

  switch (appState.currentStep) {
    case 'home':
      return <HomeScreen onGetStarted={handleGetStarted} />;

    case 'name':
      return <NameScreen onContinue={handleNameContinue} />;

    case 'gender':
      return <GenderScreen onContinue={handleGenderContinue} />;

    case 'jersey':
      return <JerseyScreen onContinue={handleJerseyContinue} />;

    case 'capture':
      return <CameraCapture onCapture={handleImageCapture} />;
    
    case 'result':
      return (
        <TryOnResult
          userImage={appState.userImage!}
          selectedClothing={appState.selectedClothing?.imageUrl || ''}
          resultImage={appState.resultImage || ''}
          isLoading={appState.isLoading}
          onStartOver={handleStartOver}
          onShowQr={handleShowQr}
        />
      );

    case 'qr':
      return <QrScreen value={appState.qrValue || appState.resultImage || window.location.href} />;
    
    default:
      return <CameraCapture onCapture={handleImageCapture} />;
  }
}

export default App;
