import { store } from "../services/store.js";
import { verifyAccessToken } from "../services/tokenService.js";

export async function requireAuth(request, response, next) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return response.status(401).json({ error: "Missing access token." });
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await store.findUserById(decoded.sub);

    if (!user) {
      return response.status(401).json({ error: "Authenticated user not found." });
    }

    if (user.isActive === false) {
      return response.status(403).json({ error: "This account has been deactivated by the hospital admin." });
    }

    request.user = {
      ...decoded,
      ...user,
      sub: user.userId || decoded.sub
    };

    return next();
  } catch (_error) {
    return response.status(401).json({ error: "Invalid or expired access token." });
  }
}

export function requireRole(...roles) {
  return function roleMiddleware(request, response, next) {
    if (!request.user) {
      return response.status(401).json({ error: "Missing authenticated user." });
    }

    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: "You do not have access to this action." });
    }

    return next();
  };
}

export function requirePasswordChangeResolved(request, response, next) {
  if (request.user?.forcePasswordChange) {
    return response.status(403).json({
      error: "Password change is required before this account can access QR and transfer actions."
    });
  }

  return next();
}
