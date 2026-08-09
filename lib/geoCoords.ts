/* -------------------------------------------------------------------------- */
/*  Lightweight lat/lng validators (shared; avoids pulling geoRadiusService).  */
/* -------------------------------------------------------------------------- */

export function isValidLatitude(lat: number): boolean {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    !Number.isNaN(lat) &&
    lat >= -90 &&
    lat <= 90
  );
}

export function isValidLongitude(lng: number): boolean {
  return (
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    !Number.isNaN(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}
