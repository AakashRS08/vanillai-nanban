import { describe, expect, it } from 'vitest';
import { conditionIcon, confidenceLabel, confidencePercent, formatTemp, placeLabel } from './format.js';

describe('format helpers', () => {
  it('maps every backend condition to an icon and has a fallback', () => {
    for (const c of ['Clear', 'Partly Cloudy', 'Cloudy', 'Fog', 'Drizzle', 'Rain', 'Snow', 'Thunderstorm']) {
      expect(conditionIcon(c)).not.toBe('🌡️');
    }
    expect(conditionIcon('Volcanic Ash')).toBe('🌡️');
    expect(conditionIcon(undefined)).toBe('🌡️');
  });

  it('formats temperatures and tolerates missing values', () => {
    expect(formatTemp(31.4)).toBe('31°');
    expect(formatTemp(-0.4)).toBe('0°');
    expect(formatTemp(null)).toBe('–');
    expect(formatTemp(undefined)).toBe('–');
    expect(formatTemp('abc')).toBe('–');
  });

  it('turns 0-1 confidence into clamped whole percentages', () => {
    expect(confidencePercent(0.874)).toBe(87);
    expect(confidencePercent(1.7)).toBe(100);
    expect(confidencePercent(-1)).toBe(0);
    expect(confidencePercent(undefined)).toBe(0);
  });

  it('labels confidence bands', () => {
    expect(confidenceLabel(0.9)).toBe('High');
    expect(confidenceLabel(0.6)).toBe('Medium');
    expect(confidenceLabel(0.2)).toBe('Low');
  });

  it('builds a readable place label without duplicating the region', () => {
    expect(placeLabel({ name: 'Chennai', region: 'Tamil Nadu', country: 'India' })).toBe('Chennai, Tamil Nadu, India');
    expect(placeLabel({ name: 'Singapore', region: 'Singapore', country: 'Singapore' })).toBe('Singapore, Singapore');
    expect(placeLabel({ name: 'Nowhere' })).toBe('Nowhere');
  });
});
