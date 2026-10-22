import { describe, it, expect } from 'vitest';
import { computeGeofence, distanceMeters, officeRadius } from '../useGeoLocation';
import { classifySyncError } from '../../../services/attendance/syncQueue';
import { OFFICE_LOCATIONS } from '../../../constants';

describe('Grava attendance site', () => {
  it('allows the site and 599 m away, but rejects 601 m away and the old office', () => {
    const site = OFFICE_LOCATIONS[0];
    const north = (metres: number) => site.lat + metres / 6371000 * 180 / Math.PI;
    expect(OFFICE_LOCATIONS).toHaveLength(1);
    expect(computeGeofence(17.3975051, 78.3157152, OFFICE_LOCATIONS)?.inside).toBe(true);
    expect(computeGeofence(north(599), site.lng, OFFICE_LOCATIONS)?.inside).toBe(true);
    expect(computeGeofence(north(601), site.lng, OFFICE_LOCATIONS)?.inside).toBe(false);
    expect(computeGeofence(17.445888, 78.397484, OFFICE_LOCATIONS)?.inside).toBe(false);
  });
});

// Two offices ~1.1 km apart on the same latitude.
const SMALL = { name: 'Small', lat: 17.0, lng: 78.0, radius: 100 };
const BIG = { name: 'Big', lat: 17.0, lng: 78.0105, radius: 1500 };

describe('officeRadius', () => {
  it('uses the office radius, or 200 m when none is set', () => {
    expect(officeRadius(SMALL)).toBe(100);
    expect(officeRadius({ ...SMALL, radius: 0 })).toBe(200);
    expect(officeRadius({ ...SMALL, radius: undefined as unknown as number })).toBe(200);
  });
});

describe('computeGeofence', () => {
  it('uses each office radius, not a fixed one', () => {
    // 150 m from Small: outside its 100 m radius.
    const lng = 78.0 + 150 / 106_400;
    const res = computeGeofence(17.0, lng, [SMALL]);
    expect(res?.inside).toBe(false);
    expect(res?.radiusM).toBe(100);
    expect(res!.distanceM).toBeGreaterThan(140);
  });

  it('prefers an office you are inside over a nearer one you are not', () => {
    // 300 m east of Small: nearer to Small, but only inside Big's 1.5 km radius.
    const lng = 78.0 + 300 / 106_400;
    expect(distanceMeters(17.0, lng, SMALL.lat, SMALL.lng)).toBeLessThan(distanceMeters(17.0, lng, BIG.lat, BIG.lng));
    const res = computeGeofence(17.0, lng, [SMALL, BIG]);
    expect(res?.officeName).toBe('Big');
    expect(res?.inside).toBe(true);
  });

  it('reports the nearest office when outside all of them', () => {
    const res = computeGeofence(18.0, 78.0, [SMALL, BIG]);
    expect(res?.inside).toBe(false);
    expect(res?.officeName).toBe('Small');
  });
});

describe('classifySyncError', () => {
  it('does not retry a database refusal such as the office-radius check', () => {
    const res = classifySyncError({ code: 'P0001', message: 'OUTSIDE_OFFICE: check-in must be made within an office radius' });
    expect(res.retryable).toBe(false);
  });

  it('still retries a network failure', () => {
    expect(classifySyncError({ code: '', message: 'Failed to fetch' }).retryable).toBe(true);
    expect(classifySyncError(new TypeError('Failed to fetch')).retryable).toBe(true);
  });
});
