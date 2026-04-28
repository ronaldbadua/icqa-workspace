"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  deleteDatabaseEntry,
  insertDatabaseEntries,
  insertDatabaseEntry,
  updateDatabaseEntry,
} from "@/lib/services/database-entries";

type ActionResult = { ok: true } | { ok: false; error: string };

const DOCX_LABEL_MAX = 200;
const DOCX_MAX_BYTES = 12 * 1024 * 1024;
const DOCX_MAX_CHUNKS = 320;
const DOCX_CHUNK_TARGET = 1200;

/** Split plain text into paragraph-aware chunks for database rows. */
function chunkPlainTextForImport(text: string, maxLen: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const raw of paragraphs) {
    const piece = raw.trim();
    if (!piece) continue;
    const joinLen = current ? current.length + 2 + piece.length : piece.length;
    if (joinLen > maxLen && current) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  const final: string[] = [];
  for (const c of chunks) {
    if (c.length <= maxLen + 200) {
      final.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += maxLen) {
      const slice = c.slice(i, i + maxLen).trim();
      if (slice) final.push(slice);
    }
  }
  return final.filter(Boolean);
}

export async function createDatabaseEntryAction(input: {
  label: string;
  notes: string;
  data: unknown;
}): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const { data, error } = await insertDatabaseEntry(supabase, input);
  if (error || !data) {
    return { ok: false, error: error ?? "Failed to create entry." };
  }
  revalidatePath("/database");
  return { ok: true };
}

export async function updateDatabaseEntryAction(
  id: string,
  input: { label: string; notes: string; data: unknown }
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const { error } = await updateDatabaseEntry(supabase, id, input);
  if (error) {
    return { ok: false, error };
  }
  revalidatePath("/database");
  return { ok: true };
}

export async function deleteDatabaseEntryAction(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const { error } = await deleteDatabaseEntry(supabase, id);
  if (error) {
    return { ok: false, error };
  }
  revalidatePath("/database");
  return { ok: true };
}

export type ImportDocxResult = { ok: true; inserted: number } | { ok: false; error: string };

/**
 * Extract body text from a Word .docx (same engine as docx-to-full-text) and insert one DB row per chunk.
 * Embedded images are not OCR’d here; use the CLI tool for that, then paste or import a text file later if needed.
 */
export async function importDocxChunksAction(formData: FormData): Promise<ImportDocxResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a .docx file to import." };
  }
  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > DOCX_MAX_BYTES) {
    return { ok: false, error: "File is too large (max 12 MB)." };
  }
  const name = file.name?.trim() || "document.docx";
  if (!name.toLowerCase().endsWith(".docx")) {
    return { ok: false, error: "Only .docx files are supported." };
  }
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mammoth = await import("mammoth");
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const chunks = chunkPlainTextForImport(rawText, DOCX_CHUNK_TARGET);
  if (chunks.length === 0) {
    return { ok: false, error: "No readable text was found in that document." };
  }
  if (chunks.length > DOCX_MAX_CHUNKS) {
    return {
      ok: false,
      error: `That document would create ${chunks.length} records (max ${DOCX_MAX_CHUNKS}). Split the file or raise the limit in code.`,
    };
  }
  const baseTitle = name.replace(/\.docx$/i, "") || "Document";
  const total = chunks.length;
  const rows = chunks.map((content, i) => {
    const partLabel = `${baseTitle} — Part ${i + 1}/${total}`;
    const label = partLabel.length > DOCX_LABEL_MAX ? partLabel.slice(0, DOCX_LABEL_MAX - 1) + "…" : partLabel;
    const notesPreview = content.length > 420 ? `${content.slice(0, 420)}…` : content;
    return {
      label,
      notes: notesPreview,
      data: {
        source_file: name,
        chunk_index: i,
        chunk_total: total,
        content,
        import_kind: "docx",
      },
    };
  });
  const { inserted, error } = await insertDatabaseEntries(supabase, rows);
  if (error) {
    return { ok: false, error };
  }
  revalidatePath("/database");
  return { ok: true, inserted };
}
