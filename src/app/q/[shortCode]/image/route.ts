import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { getQrDestinationPath } from "@/lib/public-menu";
import { safeHttpUrl } from "@/lib/safe-url";
import { isValidShortCode } from "@/lib/slug";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;
  const normalizedCode = shortCode.trim().toUpperCase();
  if (!isValidShortCode(normalizedCode)) return new NextResponse("QR non trovato", { status: 404 });

  const destination = await getQrDestinationPath(normalizedCode);
  if (!destination) return new NextResponse("QR non trovato", { status: 404 });

  const configuredSite = safeHttpUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const origin = configuredSite ? new URL(configuredSite).origin : request.nextUrl.origin;
  const stableQrUrl = new URL(`/q/${normalizedCode}`, origin).toString();
  const svg = await QRCode.toString(stableQrUrl, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 3,
    color: { dark: "#18231e", light: "#ffffff" },
  });
  const shouldDownload = request.nextUrl.searchParams.get("download") === "1";

  return new NextResponse(svg, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="menuinterattivo-${normalizedCode}.svg"`,
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
