import * as Location from 'expo-location';

import { api, ApiError } from './api';

/**
 * What happened when we tried to tell the server where this phone is.
 * - ok: shared, and it's in the United States
 * - needs-permission: we haven't asked yet (only when `ask` is false)
 * - blocked: location is switched off for Ick; only the phone's settings can change that
 * - outside: the phone is outside the United States
 * - unavailable: allowed, but no position came back (location off, no signal, no internet)
 */
export type LocationOutcome = 'ok' | 'needs-permission' | 'blocked' | 'outside' | 'unavailable';

const withTimeout = <T>(work: Promise<T>, ms: number) =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);

/** About a mile. The exact position never leaves the phone. */
const coarse = (degrees: number) => Math.round(degrees * 100) / 100;

/**
 * Ick is US-only, and Discover sorts people by distance, so the app shares a rough location.
 * @param ask show the system permission prompt if needed. False = only use permission we already have.
 */
export async function shareLocation({ ask }: { ask: boolean }): Promise<LocationOutcome> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) return 'blocked';
      if (!ask) return 'needs-permission';
      permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return permission.canAskAgain ? 'needs-permission' : 'blocked';
    }

    // A recent fix is instant; a fresh one can take a few seconds indoors.
    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 })) ??
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), ask ? 20000 : 8000));

    // Which country is that? The server double-checks, and copes if the phone can't say.
    let countryCode: string | null = null;
    try {
      const [place] = await Location.reverseGeocodeAsync(position.coords);
      countryCode = place?.isoCountryCode ?? null;
    } catch {
      // no geocoder on this device, or no connection to it
    }

    await api.setLocation(coarse(position.coords.latitude), coarse(position.coords.longitude), countryCode);
    return 'ok';
  } catch (e) {
    return e instanceof ApiError && e.code === 'outside_us' ? 'outside' : 'unavailable';
  }
}
