import { NextResponse } from 'next/server'
import connectDB from '@/app/lib/mongodb'
import Order from '@/app/models/Order'

export const runtime = 'nodejs'

/**
 * @swagger
 * /api/admin/customers:
 *   get:
 *     summary: Get unique customers with order history summary (Admin)
 *     description: >
 *       Groups all orders by customer — using email as the primary key
 *       when available, falling back to phone number when it isn't —
 *       and returns each customer's order count, total spent, and most
 *       recent order date.
 *     responses:
 *       200:
 *         description: List of customers
 */
export async function GET() {
    try {
        await connectDB()

        const customers = await Order.aggregate([
        {
            $addFields: {
            // Group key: prefer email, fall back to phone if email is empty
            customerKey: {
                $cond: [
                { $and: [{ $ne: ['$customer.email', ''] }, { $ne: ['$customer.email', null] }] },
                '$customer.email',
                '$customer.phone',
                ],
            },
            },
        },
        {
            $group: {
            _id: '$customerKey',
            name: { $last: '$customer.name' },
            email: { $last: '$customer.email' },
            phone: { $last: '$customer.phone' },
            address: { $last: '$customer.address' },
            orderCount: { $sum: 1 },
            totalSpent: {
                $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$totalAmount', 0] },
            },
            lastOrderDate: { $max: '$createdAt' },
            },
        },
        { $sort: { lastOrderDate: -1 } },
        ])

        return NextResponse.json({
        success: true,
        count: customers.length,
        data: customers,
        })
    } catch (error) {
        console.error('GET /api/admin/customers error:', error)
        return NextResponse.json(
        { success: false, message: 'Failed to fetch customers', error: error.message },
        { status: 500 }
        )
    }
}