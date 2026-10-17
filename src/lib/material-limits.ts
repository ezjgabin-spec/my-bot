// Shared by upload controls, API validation, extraction, and storage.
// Cloudflare caps request bodies at 100 MB. Stay just below that hard limit.
export const MAX_FILE_BYTES = 99_000_000;
export const MAX_PDF_PAGES = 500;
export const MAX_MATERIAL_CHARACTERS = 500_000;
export const MAX_AI_MATERIAL_BYTES = 120_000;
