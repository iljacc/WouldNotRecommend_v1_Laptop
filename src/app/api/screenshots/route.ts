import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const SCREENSHOTS_DIR = path.join(process.cwd(), "data", "screenshots");

export async function POST(request: NextRequest) {
  try {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const { filename, dataUrl } = (await request.json()) as {
      filename?: string;
      dataUrl?: string;
    };

    if (!filename || !dataUrl) {
      return NextResponse.json(
        { error: "filename and dataUrl required" },
        { status: 400 },
      );
    }

    const safeFilename = path.basename(filename);
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const filepath = path.join(SCREENSHOTS_DIR, safeFilename);

    fs.writeFileSync(filepath, buffer);

    return NextResponse.json({ ok: true, path: filepath });
  } catch (error) {
    console.error("Screenshot save error:", error);
    return NextResponse.json({ error: "Failed to save screenshot" }, { status: 500 });
  }
}
