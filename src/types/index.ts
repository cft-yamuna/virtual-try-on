export interface ClothingItem {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  generationMode?: 'tryOn' | 'faceSwap';
  composition?: 'closePortrait';
  poseImageUrl?: string;
  promptVariant?: 'maleJ1ThreeReference' | 'femaleJ1ThreeReference';
}

export interface AppState {
  currentStep: 'home' | 'name' | 'gender' | 'jersey' | 'capture' | 'result' | 'qr';
  userName: string;
  gender: 'male' | 'female' | null;
  selectedJersey: 'j1' | 'j2' | null;
  userImage: string | null;
  selectedClothing: ClothingItem | null;
  resultImage: string | null;
  qrValue: string | null;
  isLoading: boolean;
}
