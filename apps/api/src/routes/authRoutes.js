import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { store } from "../services/store.js";
import { hashPassword, verifyPassword } from "../services/passwordService.js";
import { createAccessToken } from "../services/tokenService.js";

export const authRouter = express.Router();

function sanitizeUser(user) {
  return {
    id: user.userId || user.id,
    hospitalId: user.hospitalId || "",
    loginId: user.loginId,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
    facility: user.facility,
    isActive: user.isActive !== false,
    forcePasswordChange: Boolean(user.forcePasswordChange)
  };
}

authRouter.post("/login", async (request, response, next) => {
  try {
    const { identifier = "", email = "", password = "" } = request.body || {};
    const lookupKey = identifier || email;
    const user = await store.findUserByIdentifier(lookupKey);

    if (!user || user.isActive === false || !(await verifyPassword(password, user.passwordHash))) {
      return response.status(401).json({ error: "Invalid credentials." });
    }

    const accessToken = createAccessToken(user);

    return response.json({
      accessToken,
      user: sanitizeUser(user)
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/me", requireAuth, async (request, response) => {
  return response.json({ user: sanitizeUser(request.user) });
});

authRouter.post("/change-password", requireAuth, async (request, response, next) => {
  try {
    const { currentPassword = "", newPassword = "" } = request.body || {};

    if (!currentPassword.trim() || newPassword.trim().length < 8) {
      return response.status(422).json({ error: "Current password and a new password of at least 8 characters are required." });
    }

    const user = await store.findUserById(request.user.sub);

    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return response.status(401).json({ error: "Current password is incorrect." });
    }

    const updatedUser = await store.updateUser(request.user.sub, {
      passwordHash: await hashPassword(newPassword.trim()),
      forcePasswordChange: false
    });

    const accessToken = createAccessToken(updatedUser);

    return response.json({
      accessToken,
      user: sanitizeUser(updatedUser)
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/activity", requireAuth, requireRole("doctor"), async (request, response, next) => {
  try {
    const activity = await store.listAuditEvents({ actorUserId: request.user.sub });
    return response.json({ activity });
  } catch (error) {
    return next(error);
  }
});
