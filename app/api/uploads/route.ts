import { env } from "cloudflare:workers";

const allowed = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const designNo = String(form.get("designNo") ?? "").trim().toUpperCase();
    if (!(file instanceof File) || !designNo) return Response.json({ error: "Error: File and Design No. are required." }, { status: 400 });
    if (!allowed.has(file.type)) return Response.json({ error: "Error: Unsupported file type." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Error: File size cannot exceed 20 MB." }, { status: 400 });
    const design = await env.DB.prepare("SELECT id FROM designs WHERE design_no=?").bind(designNo).first<{ id: number }>();
    if (!design) return Response.json({ error: "Error: Design record not found." }, { status: 404 });
    const actor = await env.DB.prepare("SELECT id FROM users WHERE email='admin@msboutique.com'").first<{ id: number }>();
    if (!actor) return Response.json({ error: "Error: System administrator account is unavailable. Please refresh and try again." }, { status: 409 });
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, design_id INTEGER, file_name TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT, size INTEGER, uploaded_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const key = `designs/${designNo}/${Date.now()}-${safeName}`;
    await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { designNo } });
    await env.DB.prepare("INSERT INTO attachments (design_id,file_name,object_key,content_type,size,uploaded_by) VALUES (?,?,?,?,?,?)").bind(design.id,file.name,key,file.type,file.size,actor.id).run();
    await env.DB.prepare("INSERT INTO audit_logs (user_id,design_id,action,entity,entity_id,new_value,device) VALUES (?,?,'UPLOAD','attachment',?,?, 'Web / Chrome')").bind(actor.id,design.id,key,file.name).run();
    return Response.json({ ok: true, key }, { status: 201 });
  } catch (cause) {
    return Response.json({ error: `Unable to upload: ${cause instanceof Error ? cause.message : "Unexpected error"}` }, { status: 500 });
  }
}
