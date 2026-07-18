import { NextResponse } from 'next/server'
import { calculateDeliveryFee } from '@/app/lib/deliveryFee'

export const runtime = 'nodejs'

/**
 * @swagger
 * /api/delivery-fee:
 *   post:
 *     summary: Calculate a distance-based delivery fee
 *     description: >
 *       Geocodes the given address via OpenStreetMap (Nominatim), then
 *       calculates driving distance (domestic) or straight-line distance
 *       (international) from the studio via OSRM. Falls back to flat
 *       zone pricing if geocoding or routing fails, so checkout never
 *       breaks due to a third-party outage. This is a live preview only —
 *       the authoritative fee is recalculated server-side again when the
 *       order is actually created.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 type: string
 *                 example: 12 Allen Avenue, Ikeja, Lagos
 *               isInternational:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Delivery fee and distance (or fallback fee if unavailable)
 *       400:
 *         description: Address missing or too short
 */
export async function POST(request) {
    try {
        const { address, isInternational } = await request.json()
        const result = await calculateDeliveryFee(address, isInternational)

        if (!result.success && !address) {
        return NextResponse.json(result, { status: 400 })
        }

        return NextResponse.json(result)
    } catch (err) {
        console.error('Delivery fee calculation error:', err)
        return NextResponse.json(
        { success: false, message: 'Could not calculate delivery fee' },
        { status: 500 }
        )
    }
}