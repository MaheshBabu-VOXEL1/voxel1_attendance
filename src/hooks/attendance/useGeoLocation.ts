
import { useState, useCallback, useEffect, useRef } from 'react';
import { OFFICE_LOCATIONS, GEOFENCE_RADIUS_M } from '../../constants';
import { hrService } from '../../services/hrService';
import { OfficeLocation } from '../../types';

export interface GeofenceStatus {
  officeName: string;
  distanceM: number;
  /** This office's allowed radius in metres. */
  radiusM: number;
  inside: boolean;
}

/** An office's radius; missing or non-positive means GEOFENCE_RADIUS_M (same rule as the database). */
export const officeRadius = (office: OfficeLocation): number =>
  Number(office.radius) > 0 ? Number(office.radius) : GEOFENCE_RADIUS_M;

/** Great-circle distance in metres (haversine). */
export const distanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/**
 * The office the position is inside (the closest, if several), or else the nearest office.
 * Each office uses its own radius, as the database check (migration 0049) does.
 */
export const computeGeofence = (lat: number, lng: number, fences: OfficeLocation[]): GeofenceStatus | null => {
  let best: GeofenceStatus | null = null;
  for (const office of fences) {
    const distanceM = distanceMeters(lat, lng, office.lat, office.lng);
    const radiusM = officeRadius(office);
    const status = { officeName: office.name, distanceM, radiusM, inside: distanceM <= radiusM };
    const better = !best
      || (status.inside && !best.inside)
      || (status.inside === best.inside && distanceM < best.distanceM);
    if (better) best = status;
  }
  return best;
};

/**
 * Geolocation hook for attendance check-in/check-out (PWA / browser only).
 *
 * - Requires HTTPS (or localhost for dev).
 * - PWAs installed via "Add to Home Screen" run in a separate browser context;
 *   permission granted in the browser does NOT carry over — users must grant
 *   again when the PWA prompts.
 * - On Android, location must be enabled at OS level (Settings > Location > On)
 *   AND allowed for the browser (Settings > Apps > Chrome/PWA > Permissions > Location).
 * - On iOS, Settings > Privacy > Location Services > Safari Websites (or PWA name).
 * - If `enableHighAccuracy: true` fails (no GPS / indoors), we automatically
 *   retry with `enableHighAccuracy: false` for network-based location.
 */

const getLocationErrorMessage = (err: any): string => {
  const code = err?.code ?? err?.PERMISSION_DENIED;

  switch (code) {
    case 1: // PERMISSION_DENIED
      if (window.matchMedia?.('(display-mode: standalone)')?.matches) {
        return 'Location blocked. Open your device Settings > Apps > find this app > Permissions > Location > Allow.';
      }
      return 'Location permission denied. Please tap the lock icon in your browser address bar and allow Location access, then retry.';

    case 2: // POSITION_UNAVAILABLE
      return 'Location unavailable. Please ensure Location/GPS is turned ON in your device Settings and you are not in airplane mode.';

    case 3: // TIMEOUT
      return 'Location timed out. Please move to an area with better GPS signal or turn on Wi-Fi for faster location detection, then retry.';

    default:
      return 'Could not detect location. Please check that Location is enabled in your device Settings and try again.';
  }
};

export const useGeoLocation = () => {
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoFences, setGeoFences] = useState<OfficeLocation[]>(OFFICE_LOCATIONS);
  const [geofence, setGeofence] = useState<GeofenceStatus | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await hrService.getConfig();
        if (config.officeLocations && config.officeLocations.length > 0) {
          setGeoFences(config.officeLocations);
        }
      } catch (e) {
        // Fallback to constants is already set
      }
    };
    loadConfig();
  }, []);

  const matchOffice = (lat: number, lng: number, fences: OfficeLocation[]): string | null => {
    const fence = computeGeofence(lat, lng, fences);
    return fence?.inside ? fence.officeName : null;
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!response.ok) throw new Error('Geocode failed');
      const data = await response.json();

      if (data.address) {
        const addr = data.address;
        const parts: string[] = [];
        if (addr.road || addr.pedestrian) parts.push(addr.road || addr.pedestrian);
        if (addr.neighbourhood || addr.suburb) parts.push(addr.neighbourhood || addr.suburb);
        if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
        if (parts.length > 0) return parts.join(', ');
      }

      if (data.display_name) {
        const parts = data.display_name.split(', ').slice(0, 3);
        return parts.join(', ');
      }

      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };

  const resolveAddress = async (lat: number, lng: number, fences: OfficeLocation[]): Promise<string> => {
    const officeName = matchOffice(lat, lng, fences);
    if (officeName) return officeName;
    return await reverseGeocode(lat, lng);
  };

  const getPosition = (options: PositionOptions): Promise<GeolocationPosition> =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  const detectLocation = useCallback(async (force: boolean = false) => {
    setIsLocating(true);
    setError(null);

    try {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by this browser. Please use Chrome, Safari, or Firefox.');
        setIsLocating(false);
        return;
      }

      let pos: GeolocationPosition;
      try {
        // High accuracy first (GPS)
        pos = await getPosition({
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: force ? 0 : 60000,
        });
      } catch (highAccErr: any) {
        // Retry with network-based location on timeout / unavailable
        if (highAccErr?.code === 2 || highAccErr?.code === 3) {
          pos = await getPosition({
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: force ? 0 : 60000,
          });
        } else {
          throw highAccErr;
        }
      }

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setGeofence(computeGeofence(lat, lng, geoFences));
      const address = await resolveAddress(lat, lng, geoFences);
      setLocation({ lat, lng, address });
    } catch (err: any) {
      console.error('Geolocation detection failed:', err);
      setError(getLocationErrorMessage(err));
    } finally {
      setIsLocating(false);
    }
  }, [geoFences]);

  const watchLocation = useCallback(async () => {
    if (watchIdRef.current !== null) return;
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGeofence(computeGeofence(lat, lng, geoFences));
        resolveAddress(lat, lng, geoFences).then(address => {
          setLocation({ lat, lng, address });
        });
      },
      () => setError('Location watch error.'),
      { enableHighAccuracy: true }
    );
  }, [geoFences]);

  const clearWatch = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  return { location, geofence, isLocating, error, detectLocation, watchLocation, clearWatch };
};
