import { provideFlightsService } from './flights';
import { providePrefsService } from './prefs';
import { provideSyncService } from './sync';

/** Provides the data services of the app. Returns the function that removes them. */
export function provideCoreServices() {
  const offs = [provideFlightsService(), providePrefsService(), provideSyncService()];
  return () => offs.forEach((off) => off());
}
