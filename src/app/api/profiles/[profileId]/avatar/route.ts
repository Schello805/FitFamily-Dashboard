import { NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { db } from "@/lib/db";
import { avatarAssetForProfile, type ProfileAvatar } from "@/lib/domain";
import { getAiApiKey, type AiProvider } from "@/lib/ai-config";
import { verifyAdminPin } from "@/lib/security";

export const maxDuration = 120;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_BYTES = 1024 * 1024;
const MAX_GENERATIONS_PER_HOUR = 4;
const generationWindow = globalThis as typeof globalThis & {
  fitFamilyAvatarGenerations?: Map<string, number[]>;
};

const generationPrompt = `Erstelle aus dem ERSTEN Bild ausschließlich einen deutlich stilisierten, freundlichen 3D-COMIC-/Animationsfilm-KOPF derselben Person. Das Ergebnis muss sichtbar eine gezeichnete, hochwertige FitFamily-Cartoonfigur sein: glatte illustrative Oberflächen, leicht vereinfachte Formen und ausdrucksstarke, stilisierte Züge. KEIN Foto und KEINE fotorealistische Haut. Verwende das ZWEITE Bild ausschließlich als Stilreferenz für den FitFamily-Familienavatar. Die Person soll klar wiedererkennbar bleiben; übernimm natürliche Gesichtsform, Hautton, Frisur und markante Merkmale, ohne sie zu verschönern oder zu verändern.
WICHTIG: Ausgabe nur Kopf mit kompletter Frisur, Ohren und Gesicht, gerade von vorn. Der Kopf endet exakt unter dem Kinn. KEIN Hals, KEINE Schultern und KEIN Oberkörper. Der Hals bleibt aus der vorhandenen FitFamily-Körpergrafik, damit Kopf und Hals bei allen Fitnessstufen exakt zusammenpassen. Einheitlicher Bildausschnitt: Kopf mittig, gesamte Frisur und beide Ohren sichtbar; vom höchsten Haar bis zum Kinn etwa 90 % der Bildhöhe, Kopfbreite etwa 80 % der Bildbreite. Neutral-freundlicher Ausdruck. Freigestellt auf vollständig transparentem Hintergrund. Falls Transparenz nicht unterstützt wird, verwende einen vollkommen einfarbigen, nicht schattierten, reinen Magenta-Hintergrund (#FF00FF). Keine Schrift, kein Rahmen, kein Schatten außerhalb des Kopfes, keine leeren Ränder, keine Verjüngung/Verälterung und keine zusätzlichen Personen. Kinderfotos nur als harmlose, altersgerechte Cartoon-Darstellung.`;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function getProfile(profileId: string) {
  const client = await db();
  const result = await client.execute({
    sql: "SELECT id, avatar, birth_date, custom_avatar_data FROM profiles WHERE id = ? LIMIT 1",
    args: [profileId]
  });
  return result.rows[0] ?? null;
}

async function getStyleReference(profileId: string, avatar: string) {
  const base = avatarAssetForProfile(profileId, avatar as ProfileAvatar);
  const candidates = [`${base}-stage1.webp`, `${base}.webp`, "papa-stage1.webp"];
  for (const filename of candidates) {
    try {
      return await readFile(path.join(process.cwd(), "public", "assets", "avatars", filename));
    } catch {
      // Try the next known built-in avatar as a style guide.
    }
  }
  throw new Error("Die Avatar-Stilvorlage fehlt.");
}

async function generateWithOpenAI(apiKey: string, photo: Buffer, style: Buffer) {
  const form = new FormData();
  form.set("model", "gpt-image-2.5-flare");
  form.set("prompt", generationPrompt);
  form.set("background", "transparent");
  form.set("size", "1024x1024");
  form.set("quality", "medium");
  form.set("output_format", "png");
  form.append("image[]", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "portrait.jpg");
  form.append("image[]", new Blob([new Uint8Array(style)], { type: "image/webp" }), "avatar-style.webp");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(110_000)
  });
  if (!response.ok) throw new Error("Der Bildanbieter konnte den Avatar nicht erstellen.");
  const data = await response.json();
  const encoded = data.data?.[0]?.b64_json;
  if (typeof encoded !== "string") throw new Error("Der Bildanbieter hat kein Avatarbild zurückgegeben.");
  return Buffer.from(encoded, "base64");
}

async function generateWithGemini(apiKey: string, photo: Buffer, style: Buffer) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image",
      input: [
        { type: "text", text: generationPrompt },
        { type: "image", mime_type: "image/jpeg", data: photo.toString("base64") },
        { type: "image", mime_type: "image/webp", data: style.toString("base64") }
      ],
      response_format: { type: "image", mime_type: "image/png", aspect_ratio: "1:1", image_size: "1K" }
    }),
    signal: AbortSignal.timeout(110_000)
  });
  if (!response.ok) throw new Error("Der Bildanbieter konnte den Avatar nicht erstellen.");
  const data = await response.json();
  const imageBlock = data.steps?.flatMap((step: { content?: { type?: string; data?: string }[] }) => step.content ?? [])
    .find((content: { type?: string; data?: string }) => content.type === "image" && content.data);
  const encoded = data.output_image?.data ?? imageBlock?.data;
  if (typeof encoded !== "string") throw new Error("Der Bildanbieter hat kein Avatarbild zurückgegeben.");
  return Buffer.from(encoded, "base64");
}

async function removeGeminiChromaKey(image: Buffer) {
  const resized = sharp(image, { limitInputPixels: 20_000_000 }).resize(512, 512, {
    fit: "contain", background: { r: 255, g: 0, b: 255, alpha: 1 }
  }).ensureAlpha();
  const metadata = await resized.metadata();
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  const hasTransparency = Boolean(metadata.hasAlpha) && data.some((value, index) => index % 4 === 3 && value < 250);
  if (!hasTransparency) {
    const visited = new Uint8Array(info.width * info.height);
    const queue = new Uint32Array(info.width * info.height);
    let readIndex = 0;
    let writeIndex = 0;
    const addIfBackground = (pixelIndex: number) => {
      if (pixelIndex < 0 || pixelIndex >= visited.length || visited[pixelIndex]) return;
      const offset = pixelIndex * 4;
      const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
      if (red > 150 && blue > 145 && green < 135 && Math.abs(red - blue) < 115) {
        visited[pixelIndex] = 1;
        queue[writeIndex++] = pixelIndex;
      }
    };
    for (let x = 0; x < info.width; x += 1) {
      addIfBackground(x);
      addIfBackground((info.height - 1) * info.width + x);
    }
    for (let y = 0; y < info.height; y += 1) {
      addIfBackground(y * info.width);
      addIfBackground(y * info.width + info.width - 1);
    }
    while (readIndex < writeIndex) {
      const index = queue[readIndex++];
      data[index * 4 + 3] = 0;
      if (index % info.width > 0) addIfBackground(index - 1);
      if (index % info.width < info.width - 1) addIfBackground(index + 1);
      if (index >= info.width) addIfBackground(index - info.width);
      if (index + info.width < visited.length) addIfBackground(index + info.width);
    }
  }
  return sharp(data, { raw: info }).webp({ quality: 88, alphaQuality: 95 }).toBuffer();
}

async function normalizePersonalHead(image: Buffer) {
  const { data, info } = await sharp(image, { limitInputPixels: 20_000_000 })
    .rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + info.channels - 1] <= 12) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("Das erzeugte Avatarbild ist leer.");

  // Normalize all heads into the same transparent frame so different hairstyles
  // cannot change the apparent head size or where the chin meets the body's neck.
  const paddingX = Math.max(4, Math.round((right - left + 1) * 0.025));
  const paddingY = Math.max(4, Math.round((bottom - top + 1) * 0.025));
  left = Math.max(0, left - paddingX);
  top = Math.max(0, top - paddingY);
  right = Math.min(info.width - 1, right + paddingX);
  bottom = Math.min(info.height - 1, bottom + paddingY);
  return sharp(image, { limitInputPixels: 20_000_000 })
    .rotate()
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(430, 480, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, position: "centre" })
    .extend({ top: 16, bottom: 16, left: 41, right: 41, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88, alphaQuality: 95 }).toBuffer();
}

export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const profile = await getProfile(profileId);
  if (!profile || typeof profile.custom_avatar_data !== "string") return new Response(null, { status: 404 });
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(profile.custom_avatar_data);
  if (!match) return new Response(null, { status: 404 });
  return new Response(Buffer.from(match[1], "base64"), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const profile = await getProfile(profileId);
  if (!profile) return jsonError("Profil nicht gefunden.", 404);

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await request.formData(); } catch { return jsonError("Das Foto konnte nicht gelesen werden."); }
    const providerValue = form.get("provider");
    const pin = form.get("pin");
    const consent = form.get("consent");
    const photoFile = form.get("photo");
    if ((providerValue !== "openai" && providerValue !== "gemini") || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      return jsonError("Bitte KI-Anbieter und vierstellige Eltern-PIN prüfen.");
    }
    if (consent !== "yes") return jsonError("Bitte bestätige zuerst die Übermittlung des Fotos an den gewählten KI-Anbieter.");
    if (!(photoFile instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(photoFile.type)) {
      return jsonError("Bitte ein Foto im JPG-, PNG- oder WebP-Format auswählen.");
    }
    if (photoFile.size === 0 || photoFile.size > MAX_PHOTO_BYTES) return jsonError("Das Foto darf höchstens 10 MB groß sein.");
    if (!(await verifyAdminPin(pin))) return jsonError("Die Eltern-PIN ist nicht richtig.", 401);

    const now = Date.now();
    const attempts = generationWindow.fitFamilyAvatarGenerations ??= new Map<string, number[]>();
    const recent = (attempts.get(profileId) ?? []).filter((time) => now - time < 60 * 60 * 1000);
    if (recent.length >= MAX_GENERATIONS_PER_HOUR) return jsonError("Für dieses Profil wurden gerade mehrere Bilder erstellt. Bitte später erneut versuchen.", 429);
    const provider = providerValue as AiProvider;
    const apiKey = await getAiApiKey(provider);
    if (!apiKey) return jsonError(`Für ${provider === "openai" ? "ChatGPT / OpenAI" : "Gemini"} ist noch kein API-Schlüssel eingerichtet.`, 409);
    recent.push(now);
    attempts.set(profileId, recent);

    try {
      // Normalize orientation and strip EXIF/location metadata before forwarding the photo.
      const photo = await sharp(Buffer.from(await photoFile.arrayBuffer()))
        .rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88 }).toBuffer();
      const style = await getStyleReference(profileId, String(profile.avatar));
      const generated = provider === "openai"
        ? await generateWithOpenAI(apiKey, photo, style)
        : await generateWithGemini(apiKey, photo, style);
      const prepared = provider === "gemini" ? await removeGeminiChromaKey(generated) : generated;
      const optimized = await normalizePersonalHead(prepared);
      if (!optimized.length || optimized.length > MAX_AVATAR_BYTES) return jsonError("Das erzeugte Avatarbild ist zu groß. Bitte erneut versuchen.", 502);
      return NextResponse.json({ image: `data:image/webp;base64,${optimized.toString("base64")}` });
    } catch {
      return jsonError("Die KI konnte den Avatar gerade nicht erstellen. Bitte Foto, Internetverbindung und API-Schlüssel prüfen.", 502);
    }
  }

  const body = await request.json().catch(() => null) as { action?: unknown; pin?: unknown; image?: unknown } | null;
  if (!body || (body.action !== "save" && body.action !== "delete") || typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin)) {
    return jsonError("Bitte Aktion und vierstellige Eltern-PIN prüfen.");
  }
  if (!(await verifyAdminPin(body.pin))) return jsonError("Die Eltern-PIN ist nicht richtig.", 401);

  const client = await db();
  if (body.action === "delete") {
    await client.execute({ sql: "UPDATE profiles SET custom_avatar_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [profileId] });
    return NextResponse.json({ ok: true });
  }
  if (typeof body.image !== "string" || body.image.length > 1_500_000 || !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(body.image)) {
    return jsonError("Die Vorschau ist ungültig oder zu groß. Bitte erstelle den Avatar erneut.");
  }
  const encoded = body.image.slice("data:image/webp;base64,".length);
  const imageBytes = Buffer.from(encoded, "base64");
  if (!imageBytes.length || imageBytes.length > MAX_AVATAR_BYTES || imageBytes.toString("base64") !== encoded) {
    return jsonError("Das Avatarbild konnte nicht geprüft werden.");
  }
  await client.execute({ sql: "UPDATE profiles SET custom_avatar_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [body.image, profileId] });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const profile = await getProfile(profileId);
  if (!profile) return jsonError("Profil nicht gefunden.", 404);
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;
  if (!body || typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin)) return jsonError("Bitte vierstellige Eltern-PIN eingeben.");
  if (!(await verifyAdminPin(body.pin))) return jsonError("Die Eltern-PIN ist nicht richtig.", 401);
  const client = await db();
  await client.execute({ sql: "UPDATE profiles SET custom_avatar_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [profileId] });
  return NextResponse.json({ ok: true });
}
