import { geocodeAddress } from '@/app/lib/geocode'
import { getDrivingDistanceKm, getStraightLineDistanceKm } from '@/app/lib/distance'
import {
    STUDIO_ADDRESS,
    calculateDomesticFee,
    calculateInternationalFee,
    DELIVERY_FEES,
    } from '@/app/lib/pricing'

    // Cache the studio's geocoded coordinates in memory so we don't
    // re-geocode our own fixed address on every single request.
    let cachedOrigin = null

    async function getOrigin() {
    if (cachedOrigin) return cachedOrigin
    cachedOrigin = await geocodeAddress(STUDIO_ADDRESS)
    return cachedOrigin
    }

    // The single source of truth for delivery fee calculation — used by
    // both /api/delivery-fee (live preview while typing) and /api/orders
    // (server-side, authoritative, on actual order creation). Keeping this
    // in one place means checkout can never charge a different fee than
    // what it showed the customer, and the customer can never manipulate
    // the fee by tampering with the client.
    export async function calculateDeliveryFee(address, isInternational) {
    if (!address || address.trim().length < 5) {
        return {
        success: false,
        fee: isInternational ? DELIVERY_FEES.international : DELIVERY_FEES.national,
        method: 'fallback_flat',
        distanceKm: null,
        note: 'No address provided; using standard rate.',
        }
    }

    const origin = await getOrigin()
    if (!origin) {
        return {
        success: true,
        fee: isInternational ? DELIVERY_FEES.international : DELIVERY_FEES.national,
        method: 'fallback_flat',
        distanceKm: null,
        note: 'Distance calculation temporarily unavailable; using standard rate.',
        }
    }

    const destination = await geocodeAddress(address)
    if (!destination) {
        return {
        success: true,
        fee: isInternational ? DELIVERY_FEES.international : DELIVERY_FEES.national,
        method: 'fallback_flat',
        distanceKm: null,
        note: 'Could not locate that address precisely; using standard rate.',
        }
    }

    if (isInternational) {
        const distanceKm = getStraightLineDistanceKm(origin, destination)
        return {
        success: true,
        fee: calculateInternationalFee(distanceKm),
        distanceKm: Math.round(distanceKm),
        method: 'straight_line',
        }
    }

    let distanceKm = await getDrivingDistanceKm(origin, destination)
    let method = 'driving'

    if (distanceKm == null) {
        distanceKm = getStraightLineDistanceKm(origin, destination)
        method = 'straight_line_fallback'
    }

    return {
        success: true,
        fee: calculateDomesticFee(distanceKm),
        distanceKm: Math.round(distanceKm),
        method,
    }
}