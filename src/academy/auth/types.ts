export type UserRole = "student" | "reviewer" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  status: "active" | "blocked";
  created_at: string;
  last_login_at: string | null;
}

export class AuthError extends Error {
  constructor(message: string, readonly code: "invalid_credentials" | "blocked" | "exists" | "weak_password" | "invalid_email" | "unauthenticated" | "forbidden") {
    super(message);
  }
}
