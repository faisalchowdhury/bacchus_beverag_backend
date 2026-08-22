import httpStatus from "http-status";

import { IUser } from "./user.interface";
import { UserModel } from "./user.model";
import ApiError from "../../errors/ApiError";
import paginationBuilder from "../../utils/paginationBuilder";
import { TRole } from "../../config/role";

const updateUserById = async (
  id: string,
  updateData: Partial<IUser>,
): Promise<IUser | null> => {
  return UserModel.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true },
  );
};

/**
 * Soft-deletes a user. The email is anonymised so the address can be reused
 * for a fresh sign-up without tripping the unique index.
 */
const softDeleteUser = async (id: string, email: string): Promise<void> => {
  const base = `deleted-${Date.now()}-${email}`;
  let deletedEmail = base;
  for (let n = 1; await UserModel.exists({ email: deletedEmail }); n++) {
    deletedEmail = `${base}-${n}`;
  }

  await UserModel.findByIdAndUpdate(id, {
    isDeleted: true,
    email: deletedEmail,
    fcmToken: null,
  });
};

type UserListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  role?: TRole | string;
  date?: string;
};

/** Paginated user list for the admin dashboard. */
const getUserList = async ({
  page = 1,
  limit = 10,
  search,
  role,
  date,
}: UserListFilters) => {
  const query: Record<string, unknown> = { isDeleted: false };

  if (role) query.role = role;

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  if (date) {
    const [year, month, day] = date.split("-").map(Number);
    query.createdAt = {
      $gte: new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)),
      $lte: new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)),
    };
  }

  const skip = (page - 1) * limit;

  const [users, totalData] = await Promise.all([
    UserModel.find(query)
      .select("name email phone address role profilePicture isVerified isBlocked createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    UserModel.countDocuments(query),
  ]);

  return {
    users,
    pagination: paginationBuilder({ totalData, currentPage: page, limit }),
  };
};

const setBlockStatus = async (userId: string, isBlocked: boolean) => {
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { isBlocked },
    { new: true },
  );
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  return user;
};

export const UserService = {
  updateUserById,
  softDeleteUser,
  getUserList,
  setBlockStatus,
};
