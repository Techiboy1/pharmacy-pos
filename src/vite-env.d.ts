/// <reference types="vite/client" />

export {};

declare global {
  type PharmacyUpdateStatus = {
    phase: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'not-available' | 'error';
    currentVersion: string;
    version?: string;
    percent?: number;
    bytesPerSecond?: number;
    transferred?: number;
    total?: number;
    message?: string;
  };

  interface Window {
    pharmacyUpdater?: {
      getStatus: () => Promise<PharmacyUpdateStatus>;
      onStatus: (callback: (status: PharmacyUpdateStatus) => void) => () => void;
    };
  }
}
