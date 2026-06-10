import React, { useState } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { CameraCapture } from './components/CameraCapture';
import { ClothingSelection } from './components/ClothingSelection';
import { TryOnResult } from './components/TryOnResult';
import { generateVirtualTryOn } from './services/geminiApi';
import { uploadCapturedImage } from './services/supabase';
import { clothingItems } from './data/clothing';
import { AppState, ClothingItem } from './types';

function App() {
  const [appState, setAppState] = useState<AppState>({
    currentStep: 'home',
    userImage: null,
    selectedClothing: null,
    resultImage: null,
    isLoading: false
  });

  const handleGetStarted = () => {
    setAppState(prev => ({ ...prev, currentStep: 'capture' }));
  };

  const handleImageCapture = (imageData: string) => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'selection',
      userImage: imageData
    }));

    void uploadCapturedImage(imageData)
      .then(publicUrl => {
        console.log('Captured image uploaded to:', publicUrl);
      })
      .catch(error => {
        console.error('Failed to upload captured image:', error);
      });
  };

  const handleClothingSelection = async (clothing: ClothingItem) => {
    if (!appState.userImage) return;
    
    setAppState(prev => ({
      ...prev,
      currentStep: 'result',
      selectedClothing: clothing,
      isLoading: true
    }));

    try {
      const resultImage = await generateVirtualTryOn({
        userImage: appState.userImage,
        clothingImage: clothing.imageUrl,
        mode: clothing.generationMode || 'tryOn'
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
      userImage: null,
      selectedClothing: null,
      resultImage: null,
      isLoading: false
    });
  };

  const handleBackToCapture = () => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'capture'
    }));
  };

  switch (appState.currentStep) {
    case 'home':
      return <HomeScreen onGetStarted={handleGetStarted} />;

    case 'capture':
      return <CameraCapture onCapture={handleImageCapture} />;
    
    case 'selection':
      return (
        <ClothingSelection
          userImage={appState.userImage!}
          clothingItems={clothingItems}
          onSelectClothing={handleClothingSelection}
          onBack={handleBackToCapture}
        />
      );
    
    case 'result':
      return (
        <TryOnResult
          userImage={appState.userImage!}
          selectedClothing={appState.selectedClothing?.imageUrl || ''}
          resultImage={appState.resultImage || ''}
          isLoading={appState.isLoading}
          onStartOver={handleStartOver}
        />
      );
    
    default:
      return <CameraCapture onCapture={handleImageCapture} />;
  }
}

export default App;
