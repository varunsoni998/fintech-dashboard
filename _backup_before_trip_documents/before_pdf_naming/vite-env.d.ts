interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_BOOK_MEETING_URL: string;
  readonly VITE_OCR_API_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_DRIVE_PARENT_FOLDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
