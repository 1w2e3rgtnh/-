import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

interface VercelRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

function getSupabase() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || (!url.startsWith('https://') && !url.startsWith('http://'))) {
    return null;
  }
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: '허용되지 않은 HTTP 메서드입니다.' });
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({
      error: 'Vercel 환경 변수에 SUPABASE_URL과 SUPABASE_ANON_KEY가 설정되지 않았습니다.',
    });
    return;
  }

  const rawId = Array.isArray(req.query?.id) ? req.query?.id[0] : req.query?.id;
  const postId = Number(rawId);
  if (!Number.isInteger(postId) || postId <= 0) {
    res.status(400).json({ error: '유효하지 않은 게시글 번호입니다.' });
    return;
  }

  const viewerTokenHeader = req.headers['x-author-token'];
  const viewerToken = typeof viewerTokenHeader === 'string' ? viewerTokenHeader : undefined;

  const { data: existing, error: fetchError } = await supabase
    .from('posts')
    .select('id, author_token')
    .eq('id', postId)
    .single();

  if (fetchError || !existing) {
    res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    return;
  }

  if (existing.author_token && existing.author_token !== viewerToken) {
    res.status(403).json({ error: '본인이 작성한 게시글만 삭제할 수 있습니다.' });
    return;
  }

  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    res.status(500).json({ error: `Supabase 삭제 오류: ${error.message}` });
    return;
  }

  res.status(200).json({ ok: true });
}
