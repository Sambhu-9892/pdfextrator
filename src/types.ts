export interface ExtractedPage {
  page: number;
  text: string;
  textLength: number;
  hasText: boolean;
  source: 'native' | 'ocr';
  error?: string;
}

export interface ExtractionResult {
  docId: string;
  title: string;
  sourceUrl?: string;
  totalPages: number;
  pages: ExtractedPage[];
  fullText: string;
  metadata: Record<string, unknown>;
  extractedAt: number;
  method: 'native' | 'ocr' | 'mixed';
}

export interface PageTextOptions {
  pageNumber?: number;
  normalize?: boolean;
  mergeWithNeighbor?: boolean;
}

export interface PdfAccessError {
  code: 'fetch-failed' | 'cors-blocked' | 'permission-denied' | 'auth-required' |
    'malformed' | 'empty-file' | 'password-required' | 'unsupported' | 'size-limit' |
    'cancelled' | 'unknown';
  message: string;
  userFriendly: string;
  retryable: boolean;
  suggestion?: string;
}

export const MAX_PAGES = 500;
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export function makePdfError(
  code: PdfAccessError['code'],
  message: string,
  opts?: { userFriendly?: string; retryable?: boolean; suggestion?: string }
): PdfAccessError {
  return {
    code,
    message,
    userFriendly: opts?.userFriendly ?? message,
    retryable: opts?.retryable ?? false,
    suggestion: opts?.suggestion,
  };
}
