'use client';

import { useEffect } from 'react';

const SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const READY_EVENT = 'boltbytes:cast-sdk-ready';

type CastSdkWindow = Window & {
  cast?: { framework?: object };
  chrome?: { cast?: object };
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean, errorInfo?: unknown) => void;
    __boltbytesCastSdkPromise?: Promise<boolean>;
    __boltbytesCastSdkError?: unknown;
  }
}

export function castSdkLastError(): unknown {
  return typeof window === 'undefined' ? undefined : window.__boltbytesCastSdkError;
}

export function ensureCastSdk(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext) return Promise.resolve(false);
  const castWindow = window as CastSdkWindow;
  if (castWindow.cast?.framework && castWindow.chrome?.cast) return Promise.resolve(true);
  if (window.__boltbytesCastSdkPromise) return window.__boltbytesCastSdkPromise;

  window.__boltbytesCastSdkPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    window.__boltbytesCastSdkError = undefined;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      if (!available) delete window.__boltbytesCastSdkPromise;
      if (available) window.dispatchEvent(new CustomEvent(READY_EVENT));
      resolve(available);
    };
    const waitForFramework = (attempt = 0) => {
      if (castWindow.cast?.framework && castWindow.chrome?.cast) return finish(true);
      if (attempt >= 50) return finish(false);
      window.setTimeout(() => waitForFramework(attempt + 1), 100);
    };
    window.__onGCastApiAvailable = (available, errorInfo) => {
      if (!available) {
        window.__boltbytesCastSdkError = errorInfo ?? 'Google Cast API reported unavailable';
        return finish(false);
      }
      waitForFramework();
    };

    const stale = document.querySelector<HTMLScriptElement>('script[data-boltbytes-cast-sdk="true"]');
    if (stale && !castWindow.cast?.framework) stale.remove();
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.dataset.boltbytesCastSdk = 'true';
    script.onload = () => waitForFramework();
    script.onerror = () => {
      window.__boltbytesCastSdkError = 'Google Cast SDK script could not be downloaded';
      finish(false);
    };
    document.head.appendChild(script);
    window.setTimeout(() => {
      const available = Boolean(castWindow.cast?.framework && castWindow.chrome?.cast);
      if (!available && !window.__boltbytesCastSdkError) {
        window.__boltbytesCastSdkError = 'Google Cast SDK timed out during initialization';
      }
      finish(available);
    }, 12_000);
  });
  return window.__boltbytesCastSdkPromise;
}

export function CastSdkLoader() {
  useEffect(() => {
    void ensureCastSdk();
  }, []);
  return null;
}
