import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload an image (Admin)
 *     description: Accepts a multipart/form-data image upload and stores it on Cloudinary. Returns the hosted image URL.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload succeeded, returns the Cloudinary URL
 *       400:
 *         description: No file, wrong file type, or file too large
 *       500:
 *         description: Upload failed
 */
export async function POST(request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!file || typeof file === 'string') {
        return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 })
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
            { success: false, message: 'Only JPG, PNG, WEBP, or GIF images are allowed' },
            { status: 400 }
        )
        }

        if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
            { success: false, message: 'Image must be under 5MB' },
            { status: 400 }
        )
        }

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

        const result = await cloudinary.uploader.upload(base64, {
        folder: 'scentcraft/fragrances',
        resource_type: 'image',
        })

        return NextResponse.json({ success: true, url: result.secure_url })
    } catch (err) {
        console.error('Cloudinary upload error:', err)
        return NextResponse.json(
        { success: false, message: 'Upload failed. Please try again.' },
        { status: 500 }
        )
    }
}