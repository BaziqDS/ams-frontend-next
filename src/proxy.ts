import { NextRequest, NextResponse } from "next/server";
import { PROTECTED_ADMIN_ROUTES, hasPermission } from "@/lib/adminPermissions";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type MeResponse = {
  is_superuser?: boolean;
  permissions?: string[];
};

function requiredPermissionForPath(pathname: string) {
  const match = Object.entries(PROTECTED_ADMIN_ROUTES).find(([routePrefix]) => pathname === routePrefix || pathname.startsWith(`${routePrefix}/`));
  return match?.[1];
}

export async function proxy(request: NextRequest) {
  const requiredPermission = requiredPermissionForPath(request.nextUrl.pathname);
  if (!requiredPermission) return NextResponse.next();

  const cookie = request.headers.get("cookie") ?? "";
  const hasAccessCookie = cookie.includes("ams_access=") || cookie.includes("ams_refresh=");
  if (!hasAccessCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const meResponse = await fetch(`${API_BASE}/auth/users/me/`, {
      method: "GET",
      headers: {
        cookie,
      },
      cache: "no-store",
    });

    if (meResponse.status === 401) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (!meResponse.ok) {
      return NextResponse.next();
    }

    const me = (await meResponse.json()) as MeResponse;
    const isAllowed = Boolean(me.is_superuser) || hasPermission(me.permissions, requiredPermission);
    if (!isAllowed) {
      return NextResponse.redirect(new URL("/403", request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/users/:path*", "/roles/:path*", "/locations/:path*", "/categories/:path*", "/items/:path*", "/stock-entries/:path*", "/stock-registers/:path*", "/reports/:path*", "/inspections/:path*", "/maintenance/:path*"],
};
