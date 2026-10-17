const PUBLIC_ASSET = /\.(?:png|svg|ico|webp|jpg|jpeg)$/i;

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}

/** Brand art and icons must load on the login screen, before a session exists. */
export function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    PUBLIC_ASSET.test(pathname)
  );
}
