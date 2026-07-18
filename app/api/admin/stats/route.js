import { NextResponse } from 'next/server'
import connectDB from '@/app/lib/mongodb'
import Order from '@/app/models/Order'

export const runtime = 'nodejs'

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get dashboard stats (Admin)
 *     description: >
 *       Returns revenue totals (today / this month / all-time) and order
 *       counts broken down by status. Revenue excludes cancelled orders.
 *     responses:
 *       200:
 *         description: Dashboard stats
 */
export async function GET() {
    try {
        await connectDB()

        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

        // Revenue counts everything that isn't cancelled — includes COD orders
        // not yet marked "paid", since the sale is still real/in-progress.
        // If you'd rather revenue only reflect confirmed payments, add
        // paymentStatus: 'paid' to these match filters.
        const [todayRevenue, monthRevenue, allTimeRevenue, statusCounts, allOrdersCount] =
        await Promise.all([
            Order.aggregate([
            { $match: { createdAt: { $gte: startOfToday }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            ]),
            Order.aggregate([
            { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            ]),
            Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            ]),
            Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
            Order.countDocuments(),
        ])

        // Turn the aggregation array into a clean { pending: 3, shipped: 1, ... } object
        const statusMap = {
        pending: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0,
        }
        statusCounts.forEach(s => { statusMap[s._id] = s.count })

        return NextResponse.json({
        success: true,
        data: {
            revenue: {
            today: todayRevenue[0]?.total || 0,
            todayOrders: todayRevenue[0]?.count || 0,
            month: monthRevenue[0]?.total || 0,
            monthOrders: monthRevenue[0]?.count || 0,
            allTime: allTimeRevenue[0]?.total || 0,
            allTimeOrders: allTimeRevenue[0]?.count || 0,
            },
            statusCounts: statusMap,
            totalOrders: allOrdersCount,
        },
        })
    } catch (error) {
        console.error('GET /api/admin/stats error:', error)
        return NextResponse.json(
        { success: false, message: 'Failed to fetch stats', error: error.message },
        { status: 500 }
        )
    }
}