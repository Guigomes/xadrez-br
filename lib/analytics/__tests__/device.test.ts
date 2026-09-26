import { describe, expect, it } from 'vitest';
import { describeUserAgent } from '../device';

describe('describeUserAgent', () => {
  it('identifica Chrome no Android como celular', () => {
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'))
      .toEqual({ deviceType: 'mobile', browser: 'Chrome', os: 'Android' });
  });

  it('identifica Safari no iPhone', () => {
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'))
      .toEqual({ deviceType: 'mobile', browser: 'Safari', os: 'iOS' });
  });

  it('identifica Edge no Windows como computador', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0'))
      .toEqual({ deviceType: 'desktop', browser: 'Edge', os: 'Windows' });
  });
});
