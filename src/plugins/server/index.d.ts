interface Server{
  stop(onSuccess?: () => void, onError?: (error: any) => void): void;
  send(id: string, data: any, onSuccess?: () => void, onError?: (error: any) => void): void;
  setOnRequestHandler(callback: (request: any) => void): void;
  getUrl(path?: string): string;
  isRequestActive(id: string): boolean;
  port: number;
}

declare var CreateServer: (port: number, onSuccess: (msg: any) => void, onError: (err: any) => void) => Server;
