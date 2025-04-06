/**
 * Simple fetch polyfill for browsers that don't support it
 * This is a basic implementation that covers the needs of Quanta.js
 */

export function installFetchPolyfill(): void {
  // Skip if fetch is already available
  if (typeof window !== "undefined" && "fetch" in window) {
    return;
  }

  // Basic Response implementation
  class Response {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Headers;
    url: string;
    private _body: string;

    constructor(body: string, options: any = {}) {
      this._body = body || "";
      this.ok = options.status >= 200 && options.status < 300;
      this.status = options.status || 200;
      this.statusText = options.statusText || "";
      this.headers = new Headers(options.headers);
      this.url = options.url || "";
    }

    text(): Promise<string> {
      return Promise.resolve(this._body);
    }

    json(): Promise<any> {
      try {
        return Promise.resolve(JSON.parse(this._body));
      } catch (e) {
        return Promise.reject(e);
      }
    }
  }

  // Basic Headers implementation
  class Headers {
    private _headers: Record<string, string>;

    constructor(init?: Record<string, string>) {
      this._headers = {};
      if (init) {
        Object.keys(init).forEach((key) => {
          this._headers[key.toLowerCase()] = init[key];
        });
      }
    }

    get(name: string): string | null {
      return this._headers[name.toLowerCase()] || null;
    }

    set(name: string, value: string): void {
      this._headers[name.toLowerCase()] = value;
    }
  }

  // Polyfill fetch function
  (window as any).fetch = function (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open(options.method || "GET", url);

      if (options.headers) {
        const headers = options.headers as Record<string, string>;
        Object.keys(headers).forEach((key) => {
          xhr.setRequestHeader(key, headers[key]);
        });
      }

      xhr.onload = function () {
        const headers: Record<string, string> = {};
        const headerString = xhr.getAllResponseHeaders();
        const headerPairs = headerString.split("\u000d\u000a");

        for (let i = 0; i < headerPairs.length; i++) {
          const headerPair = headerPairs[i];
          const index = headerPair.indexOf("\u003a\u0020");
          if (index > 0) {
            const key = headerPair.slice(0, index).toLowerCase();
            const val = headerPair.slice(index + 2);
            headers[key] = val;
          }
        }

        resolve(
          new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers,
            url,
          })
        );
      };

      xhr.onerror = function () {
        reject(new Error("Network request failed"));
      };

      xhr.ontimeout = function () {
        reject(new Error("Network request timed out"));
      };

      xhr.send(options.body !== undefined ? (options.body as string) : null);
    });
  };
}
