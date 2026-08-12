import { getD1 } from "@/db/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uploaded logos are stored as data URIs. Serving them from their own cacheable
// endpoint keeps ~40 KB of base64 out of every state payload and every poll.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shopId = Number(url.searchParams.get("shop") ?? 0);
    const db = getD1();
    const row = shopId > 0
      ? await db.prepare("SELECT logo_url FROM shops WHERE id=?").bind(shopId).first<{ logo_url: string }>()
      : await db.prepare("SELECT logo_url FROM system_settings WHERE id=1").first<{ logo_url: string }>();

    const dataUri = String(row?.logo_url ?? "");
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUri);
    if (!match) return new Response("No logo uploaded.", { status: 404 });

    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

    return new Response(bytes, {
      headers: {
        "Content-Type": match[1],
        // The URL carries a version stamp, so a stored copy is always safe to reuse.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Logo unavailable.", { status: 500 });
  }
}
