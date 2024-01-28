/// @brief Convert latitude/longitude/altitude to ECEF coords.
/// @details Assumes a WGS-84 ellipsoid for LLA.
/// @param latitude Latitude in degrees.
/// @param longitude Longitude in degrees.
/// @param altitude Altitude in meters.
/// @return ECEF x, y, z object.
export function lla2ecef(latitude, longitude, altitude) {
  const radian = Math.PI / 180.0;

  // WGS84 ellipsoidal parameters
  const a = 6378137.0; // semi-major axis in meters
  const f = 1.0 / 298.257223563; // flattening
  const b = (1.0 - f) * a; // semi-minor axis

  // Calculate the eccentricity squared
  const esq = 2.0 * f - f * f;

  // Convert latitude and longitude to radians
  const latRad = latitude * radian;
  const lonRad = longitude * radian;

  // Calculate prime vertical radius of curvature
  const N = a / Math.sqrt(1.0 - esq * Math.sin(latRad) * Math.sin(latRad));

  // Calculate ECEF coordinates
  const x = (N + altitude) * Math.cos(latRad) * Math.cos(lonRad);
  const y = (N + altitude) * Math.cos(latRad) * Math.sin(lonRad);
  const z = (N * (1.0 - esq) + altitude) * Math.sin(latRad);

  return { x, y, z };
}

/// @brief Calculate the Euclidean norm (magnitude) of a 3D vector.
/// @param vector Object with fields x, y, z in meters.
/// @return Norm (scalar quantity).
export function norm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
}

/// @brief Convert feet to meters.
/// @param feet Value in feet.
/// @return Value in meters.
export function ft2m(feet) {
  return feet * 0.3048;
}
