export const DEVICE_STORAGE_KEY = 'gambito_device_id';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'other';

export interface DeviceDescription {
  deviceType: DeviceType;
  browser: string;
  os: string;
}

export function describeUserAgent(userAgent: string): DeviceDescription {
  const tablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
  const mobile = !tablet && /Mobi|Android|iPhone|iPod/i.test(userAgent);

  let browser = 'Outro navegador';
  if (/SamsungBrowser/i.test(userAgent)) browser = 'Samsung Internet';
  else if (/EdgA?\//i.test(userAgent)) browser = 'Edge';
  else if (/CriOS|Chrome\//i.test(userAgent)) browser = 'Chrome';
  else if (/FxiOS|Firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/Safari\//i.test(userAgent)) browser = 'Safari';

  let os = 'Outro sistema';
  if (/iPad|iPhone|iPod/i.test(userAgent)) os = 'iOS';
  else if (/Android/i.test(userAgent)) os = 'Android';
  else if (/Windows/i.test(userAgent)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(userAgent)) os = 'macOS';
  else if (/Linux/i.test(userAgent)) os = 'Linux';

  return {
    deviceType: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop',
    browser,
    os,
  };
}

export function getOrCreateDeviceId(): string | null {
  if (typeof window === 'undefined' || !window.crypto?.randomUUID) return null;

  try {
    const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored) return stored;

    const id = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
}
