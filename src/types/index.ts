export interface ClothingItem {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
}

export interface AppState {
  currentStep: 'home' | 'capture' | 'selection' | 'result';
  userImage: string | null;
  selectedClothing: ClothingItem | null;
  resultImage: string | null;
  isLoading: boolean;
}