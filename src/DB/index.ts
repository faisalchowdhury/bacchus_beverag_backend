import { UserModel } from "../modules/user/user.model";
import { hashPassword } from "../modules/user/user.utils";
import { AboutModel } from "../modules/settings/About/About.model";
import { PrivacyModel } from "../modules/settings/privacy/Privacy.model";
import { TermsModel } from "../modules/settings/Terms/Terms.model";

const superAdmin = {
  name: process.env.SEED_ADMIN_NAME || "Admin",
  email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  password: process.env.SEED_ADMIN_PASSWORD || "Admin@1234",
  role: "admin" as const,
  isVerified: true,
  isDeleted: false,
};

/** Creates the first admin account if none exists. */
export const seedSuperAdmin = async () => {
  const exists = await UserModel.findOne({
    email: superAdmin.email,
    role: "admin",
  });
  if (exists) return;

  await UserModel.create({
    ...superAdmin,
    password: await hashPassword(superAdmin.password),
  });
  console.log(`👤 Admin seeded: ${superAdmin.email}`);
};

/** Creates one placeholder document for each settings page. */
export const seedSettingsPages = async () => {
  const pages: [any, string][] = [
    [PrivacyModel, "Privacy policy — replace this text from the admin panel."],
    [TermsModel, "Terms and conditions — replace this text from the admin panel."],
    [AboutModel, "About us — replace this text from the admin panel."],
  ];

  for (const [Model, description] of pages) {
    if (!(await Model.findOne())) await Model.create({ description });
  }
};

/** Runs every seed. Called once at startup. */
export const runSeeds = async () => {
  await Promise.all([seedSuperAdmin(), seedSettingsPages()]);
};

export default runSeeds;
