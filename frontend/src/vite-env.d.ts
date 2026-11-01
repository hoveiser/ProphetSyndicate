/// <reference types="vite/client" />

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface Window {
  ethereum?: Eip1193Provider;
}
