import "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;    // injected by requestId middleware
      userId?:   string;    // Clerk sub, injected by auth middleware
      dbUserId?: number;    // internal DB user.id, resolved after auth
    }
  }
}
