/** Track file extensions the importers read, as an `accept` list. */
export const TRACK_ACCEPT = '.igc,.gpx,.kml,.geojson,.json,.trk,.fit';

/** The track files of a file list, other files are dropped. */
export const trackFiles = (list: FileList | null | undefined) =>
  [...(list ?? [])].filter((f) => /\.(igc|gpx|kml|geojson|json|trk|fit)$/i.test(f.name));
