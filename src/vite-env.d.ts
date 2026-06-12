/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKGROUND_REMOVAL_PROVIDER?: 'imgly' | 'clippingmagic';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_YOUCAM_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
