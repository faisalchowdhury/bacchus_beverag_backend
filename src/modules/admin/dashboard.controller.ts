import { Request, Response } from "express";
import httpStatus from "http-status";

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { UserModel } from "../user/user.model";
import { PaymentModel } from "../payment/payment.model";

type Period = "daily" | "weekly" | "monthly";

/** Start of the current and previous window for the requested period. */
const periodBounds = (period: Period) => {
  const now = new Date();

  if (period === "monthly") {
    return {
      currentStart: new Date(now.getFullYear(), now.getMonth(), 1),
      previousStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    };
  }

  if (period === "weekly") {
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - now.getDay());
    currentStart.setHours(0, 0, 0, 0);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 7);
    return { currentStart, previousStart };
  }

  const currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - 1);
  return { currentStart, previousStart };
};

const percentChange = (current: number, previous: number): string => {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
};

const sumPaid = async (match: Record<string, unknown> = {}) => {
  const agg = await PaymentModel.aggregate([
    { $match: { status: "paid", ...match } },
    { $group: { _id: null, total: { $sum: "$amountTotal" } } },
  ]);
  return agg[0]?.total || 0;
};

/**
 * GET /admin/dashboard-stats?period=daily|weekly|monthly
 *
 * Totals, period-over-period change and a revenue series for the chart.
 * Extend `data` with whatever the new project's dashboard needs.
 */
const getDashboardStats = catchAsync(async (req: Request, res: Response) => {
  const period = ((req.query.period as Period) || "daily") as Period;
  const { currentStart, previousStart } = periodBounds(period);
  const now = new Date();

  const activeUserQuery = { isDeleted: false, role: { $ne: "admin" } };

  const [
    totalRevenue,
    totalTransactions,
    totalUsers,
    currentRevenue,
    previousRevenue,
    currentTx,
    previousTx,
    currentUsers,
    previousUsers,
  ] = await Promise.all([
    sumPaid(),
    PaymentModel.countDocuments({ status: "paid" }),
    UserModel.countDocuments(activeUserQuery),
    sumPaid({ createdAt: { $gte: currentStart } }),
    sumPaid({ createdAt: { $gte: previousStart, $lt: currentStart } }),
    PaymentModel.countDocuments({ status: "paid", createdAt: { $gte: currentStart } }),
    PaymentModel.countDocuments({
      status: "paid",
      createdAt: { $gte: previousStart, $lt: currentStart },
    }),
    UserModel.countDocuments({ ...activeUserQuery, createdAt: { $gte: currentStart } }),
    UserModel.countDocuments({
      ...activeUserQuery,
      createdAt: { $gte: previousStart, $lt: currentStart },
    }),
  ]);

  // --- revenue series -------------------------------------------------------
  const chartData: { label: string; revenue: number }[] = [];

  if (period === "monthly") {
    const agg = await PaymentModel.aggregate([
      {
        $match: {
          status: "paid",
          createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$amountTotal" },
        },
      },
    ]);
    const map = new Map(agg.map((d: any) => [d._id, d.revenue]));

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      chartData.push({
        label: d.toLocaleDateString("en-US", { month: "short" }),
        revenue: map.get(key) || 0,
      });
    }
  } else {
    // daily & weekly both chart the last 14 days
    const start = new Date(now);
    start.setDate(start.getDate() - 13);
    start.setHours(0, 0, 0, 0);

    const agg = await PaymentModel.aggregate([
      { $match: { status: "paid", createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$amountTotal" },
        },
      },
    ]);
    const map = new Map(agg.map((d: any) => [d._id, d.revenue]));

    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      chartData.push({
        label: d.toISOString().split("T")[0],
        revenue: map.get(d.toISOString().split("T")[0]) || 0,
      });
    }
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard stats retrieved successfully.",
    data: {
      period,
      stats: {
        totalRevenue,
        revenueChange: percentChange(currentRevenue, previousRevenue),
        totalTransactions,
        txChange: percentChange(currentTx, previousTx),
        totalUsers,
        userChange: percentChange(currentUsers, previousUsers),
      },
      chartData,
    },
  });
});

export const DashboardController = { getDashboardStats };
