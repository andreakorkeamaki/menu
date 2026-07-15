import { NextResponse } from "next/server";
import { getQrDestinationPath } from "@/lib/public-menu";

export async function GET(request: Request, { params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params;
  const destinationPath = await getQrDestinationPath(shortCode);

  if (!destinationPath) {
    return NextResponse.json({ error: "QR code not found" }, { status: 404 });
  }

  // Temporary redirect is intentional: the stable QR must resolve a changed slug on every scan.
  return NextResponse.redirect(new URL(destinationPath, request.url), 307);
}
