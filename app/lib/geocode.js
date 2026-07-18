// Geocoding via OpenStreetMap's Nominatim service.
// Turns a free-text address into { lat, lon }.
//
// Usage policy note: Nominatim's public server caps requests at ~1/sec
// and requires a descriptive User-Agent. Fine for our current volume —
// if this scales up a lot, self-hosting Nominatim (or switching to a
// paid geocoding provider) becomes worth revisiting.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(address) {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`

    try {
        const res = await fetch(url, {
        headers: {
            // Replace with a real contact — Nominatim's policy asks for this
            // so they can reach you if your usage needs attention.
            'User-Agent': 'ScentCraft-DeliveryCalc/1.0 (contact: vickyboi229@gmail.com)',
            // A bare server-side fetch lacks the headers a real browser sends
            // automatically — adding them here since Nominatim's bot
            // protection appears to reject requests without them.
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        })

        if (!res.ok) {
        const bodyText = await res.text().catch(() => '(no body)')
        console.error('Nominatim geocoding failed:', res.status, bodyText)
        return null
        }

        const data = await res.json()

        if (!data || data.length === 0) {
        return null
        }

        return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name,
        }
    } catch (err) {
        // Network-level failure (DNS, timeout, connection refused) — not an
        // HTTP error status, so it never reaches the res.ok check above.
        // Must be caught here too, or the caller's fallback logic never runs.
        console.error('Nominatim request failed:', err.message)
        return null
    }
}