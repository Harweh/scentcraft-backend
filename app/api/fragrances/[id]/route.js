import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import Fragrance from '@/models/Fragrance'


/**
 * @swagger
 * /api/fragrances/{id}:
 *   get:
 *     summary: Get one fragrance by ID
 *     description: Returns a single fragrance document by its MongoDB _id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB _id of the fragrance
 *     responses:
 *       200:
 *         description: Fragrance found
 *       404:
 *         description: Fragrance not found
 *   delete:
 *     summary: Delete a fragrance (Admin)
 *     description: Permanently removes a fragrance from the catalog
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB _id of the fragrance
 *     responses:
 *       200:
 *         description: Fragrance deleted successfully
 *       404:
 *         description: Fragrance not found
 */


export async function GET(request, { params }) {
  try {
    await connectDB()


    const { id } = await params

    // .findById() is Mongoose shorthand for .findOne({ _id: id })
    const fragrance = await Fragrance.findById(id)

    // If no fragrance found with that ID, send 404
    if (!fragrance) {
      return NextResponse.json(
        {
          success: false,
          message: 'Fragrance not found',
        },
        { status: 404 }
        // 404 = Not Found
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: fragrance,
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('GET /api/fragrances/[id] error:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch fragrance',
        error: error.message,
      },
      { status: 500 }
    )
  }
}


export async function DELETE(request, { params }) {
  try {
    const secret = request.headers.get('x-admin-secret')
    if (secret !== (process.env.ADMIN_SECRET || 'aura-admin-2026')) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    await connectDB()

    const { id } = await params

    const fragrance = await Fragrance.findByIdAndDelete(id)

    // If nothing was found to delete, send 404
    if (!fragrance) {
      return NextResponse.json(
        {
          success: false,
          message: 'Fragrance not found',
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: `"${fragrance.name}" has been deleted`,
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('DELETE /api/fragrances/[id] error:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to delete fragrance',
        error: error.message,
      },
      { status: 500 }
    )
  }
}


export async function PATCH(request, { params }) {
  try {
    // Admin-only — check secret header
    const secret = request.headers.get('x-admin-secret')
    if (secret !== (process.env.ADMIN_SECRET || 'aura-admin-2026')) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    await connectDB()
    const { id } = await params
    const body = await request.json()

    // Only allow known fields to be updated — never let embedding be overwritten here
    const allowed = ['name', 'category', 'description', 'duration', 'pricePerMl', 'imageUrl', 'color', 'emoji', 'inStock']
    const updates = {}
    allowed.forEach(field => { if (body[field] !== undefined) updates[field] = body[field] })

    const fragrance = await Fragrance.findByIdAndUpdate(id, updates, { new: true, runValidators: true })

    if (!fragrance) {
      return NextResponse.json({ success: false, message: 'Fragrance not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Fragrance updated', data: fragrance }, { status: 200 })

  } catch (error) {
    console.error('PATCH /api/fragrances/[id] error:', error)
    return NextResponse.json({ success: false, message: 'Failed to update fragrance', error: error.message }, { status: 500 })
  }
}