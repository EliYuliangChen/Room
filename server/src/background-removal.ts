// Future adapter only: no model, automatic inference, or network request.
export const ENABLE_BACKGROUND_REMOVAL = false;
export interface BackgroundRemovalService { remove(input: Uint8Array): Promise<Uint8Array> }
