// Centralized business pricing logic.
// Any time a fee changes (boss gives you real delivery rates, mixing fee
// goes up, etc.) — this is the ONLY file that needs editing.

export const MIXING_FEE = 2500
export const VIAL_COST = 800

export const DELIVERY_FEES = {
  local: 1500,         // same state as the studio — used as fallback only
  national: 3500,       // other Nigerian states — used as fallback only
  international: 15000, // outside Nigeria — used as fallback only
}

// The studio's physical address. Delivery distances are calculated from
// here via OpenStreetMap geocoding. Change this if the studio ever moves —
// nothing else needs updating.
export const STUDIO_ADDRESS =
    process.env.STUDIO_ADDRESS || '18 Ogundapo, Aboru, Iyana Ipaja, Lagos, Nigeria'

// ── Domestic delivery (real driving distance via OSRM) ──────────────
export const DOMESTIC_BASE_FEE = 800
export const DOMESTIC_RATE_PER_KM = 120
export const DOMESTIC_MIN_FEE = 1200
export const DOMESTIC_MAX_FEE = 6000

export function calculateDomesticFee(distanceKm) {
    const fee = DOMESTIC_BASE_FEE + distanceKm * DOMESTIC_RATE_PER_KM
    return Math.min(DOMESTIC_MAX_FEE, Math.max(DOMESTIC_MIN_FEE, Math.round(fee)))
}

// ── International delivery (straight-line distance — driving distance
// doesn't apply across oceans/borders). This is a rough proxy, not real
// freight pricing — actual courier cost depends on weight/customs too.
// The floor matches the old flat rate so it's never a downgrade. ──────
export const INTL_BASE_FEE = 15000
export const INTL_RATE_PER_KM = 5
export const INTL_MIN_FEE = 15000

export function calculateInternationalFee(distanceKm) {
    const fee = INTL_BASE_FEE + distanceKm * INTL_RATE_PER_KM
    return Math.max(INTL_MIN_FEE, Math.round(fee))
}

// Returns the right FLAT fee for a given zone — kept only as a fallback
// for when geocoding/routing fails (see /api/delivery-fee)
export function getDeliveryFee(zone) {
    return DELIVERY_FEES[zone] ?? null
}

// ── AI blend recipe ratios ───────────────────────────────────────────
// Classic perfumery pyramid: top notes are lightest/most volatile so
// they get the smallest share, base notes anchor the scent so they get
// the largest, heart sits in between. These percentages always sum to 1.
export const BLEND_RATIOS = { Top: 0.2, Heart: 0.5, Base: 0.3 }

// Matches the volume options already used on the product page (ML_OPTIONS)
export const BLEND_VOLUME_OPTIONS = [15, 30, 50, 100]
export const DEFAULT_BLEND_VOLUME = 30

// Turns 2-3 matched fragrances into ONE combined recipe with role-based
// volumes that add up to totalVolume, plus a fragrance cost.
// matchedFragrances: [{ name, emoji, category, description, pricePerMl, color, imageUrl, role }]
export function buildBlendRecipe(matchedFragrances, totalVolume = DEFAULT_BLEND_VOLUME) {
        const recipe = matchedFragrances.map((f) => {
            const ratio = BLEND_RATIOS[f.role] ?? (1 / matchedFragrances.length)
            const volume = Math.round(totalVolume * ratio * 10) / 10 // 1 decimal place
            return {
            ...f,
            volume,
            percentage: Math.round(ratio * 100),
            }
        })

        const fragranceCost = recipe.reduce((sum, f) => sum + f.pricePerMl * f.volume, 0)

        return { recipe, totalVolume, fragranceCost: Math.round(fragranceCost) }
}

// Only manual_mix and ai_match orders involve actual mixing labor + a vial
// as_is purchases skip both entirely
export function getMixingCosts(purchaseType) {
    const appliesMixing = purchaseType === 'manual_mix' || purchaseType === 'ai_match'
    return {
        mixingFee: appliesMixing ? MIXING_FEE : 0,
        vialCost: appliesMixing ? VIAL_COST : 0,
    }
}