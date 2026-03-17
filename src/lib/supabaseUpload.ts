import { createClient } from '@supabase/supabase-js';

/**
 * Upload a file directly to Supabase Storage using a signed upload URL (path + token).
 * Used for sketch uploads so the file never passes through the API (avoids body size limits).
 */
export async function uploadToSignedUrl(params: {
  supabaseUrl: string;
  anonKey: string;
  bucket: string;
  path: string;
  token: string;
  file: File;
}): Promise<void> {
  const { supabaseUrl, anonKey, bucket, path, token, file } = params;
  const supabase = createClient(supabaseUrl, anonKey);
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}
