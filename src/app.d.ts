/// <reference types="vite/client" />

declare global {
  namespace App {}

  // File Handling API (Chromium). Not part of TypeScript's DOM lib.
  interface LaunchParams {
    files: FileSystemFileHandle[];
  }
  interface LaunchQueue {
    setConsumer(consumer: (params: LaunchParams) => void): void;
  }
  interface Window {
    launchQueue?: LaunchQueue;
  }
}

export {};
