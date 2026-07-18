// Distance calculation.
// - getDrivingDistanceKm: real road distance via OSRM (for domestic delivery)
// - getStraightLineDistanceKm: great-circle distance (for international,
//   where "driving distance" doesn't apply — or as a fallback if OSRM fails)
//
// Usage policy note: router.project-osrm.org is OSRM's free public demo
// server — good for getting this working now, but not guaranteed uptime
// for production traffic at scale. If this becomes unreliable later,
// self-hosting OSRM or switching to OpenRouteService/Mapbox is the fix.

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

export async function getDrivingDistanceKm(origin, destination) {
    const url = `${OSRM_URL}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`

    try {
        const res = await fetch(url)
        if (!res.ok) {
        console.error('OSRM routing failed:', res.status)
        return null
        }

        const data = await res.json()
        if (data.code !== 'Ok' || !data.routes?.length) {
        return null
        }

        return data.routes[0].distance / 1000 // meters -> km
    } catch (err) {
        console.error('OSRM request error:', err)
        return null
    }
    }

    export function getStraightLineDistanceKm(origin, destination) {
    const R = 6371 // Earth's radius in km
    const dLat = toRad(destination.lat - origin.lat)
    const dLon = toRad(destination.lon - origin.lon)
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(origin.lat)) *
        Math.cos(toRad(destination.lat)) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

function toRad(deg) {
  return (deg * Math.PI) / 180
}