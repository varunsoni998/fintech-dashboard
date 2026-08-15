interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_BOOK_MEETING_URL: string;
  readonly VITE_OCR_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}