import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

interface VercelRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
  body?: unknown;
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

async function parseBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
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

  const body = await parseBody(req);
  const delta = body.delta === -1 ? -1 : 1;

  const { data: existing, error: fetchError } = await supabase
    .from('posts')
    .select('id, anonymous_id, content, likes, author_token, created_at')
    .eq('id', postId)
    .single();

  if (fetchError || !existing) {
    res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    return;
  }

  const nextLikes = Math.max(0, (existing.likes ?? 0) + delta);
  const { data, error } = await supabase
    .from('posts')
    .update({ likes: nextLikes })
    .eq('id', postId)
    .select('id, anonymous_id, content, likes, author_token, created_at')
    .single();

  if (error || !data) {
    res.status(500).json({ error: `Supabase 공감 반영 오류: ${error?.message || '알 수 없는 오류'}` });
    return;
  }

  const viewerTokenHeader = req.headers['x-author-token'];
  const viewerToken = typeof viewerTokenHeader === 'string' ? viewerTokenHeader : undefined;

  res.status(200).json({
    post: {
      id: data.id,
      anonymous_id: data.anonymous_id,
      content: data.content,
      likes: data.likes ?? 0,
      created_at: data.created_at,
      is_mine: Boolean(viewerToken && data.author_token && data.author_token === viewerToken),
    },
  });
}
