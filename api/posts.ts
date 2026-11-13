import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

interface StoredPost {
  id: number;
  anonymous_id: string;
  content: string;
  likes: number;
  author_token?: string | null;
  created_at: string;
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

function sanitizePost(post: StoredPost, viewerToken?: string) {
  return {
    id: post.id,
    anonymous_id: post.anonymous_id,
    content: post.content,
    likes: typeof post.likes === 'number' ? post.likes : 0,
    created_at: post.created_at,
    is_mine: Boolean(viewerToken && post.author_token && post.author_token === viewerToken),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({
      error:
        'Vercel 환경 변수에 SUPABASE_URL과 SUPABASE_ANON_KEY(또는 VITE_ 접두사 변수)가 설정되지 않았습니다.',
    });
    return;
  }

  const viewerTokenHeader = req.headers['x-author-token'];
  const viewerToken = typeof viewerTokenHeader === 'string' ? viewerTokenHeader : undefined;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('posts')
      .select('id, anonymous_id, content, likes, author_token, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (error) {
      res.status(500).json({ error: `Supabase 조회 오류: ${error.message}` });
      return;
    }

    res.status(200).json({
      posts: (data ?? []).map((row) => sanitizePost(row as StoredPost, viewerToken)),
    });
    return;
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const rawId = typeof body.anonymous_id === 'string' ? body.anonymous_id.trim() : '';
    const rawContent = typeof body.content === 'string' ? body.content.trim() : '';

    if (!rawId || rawId.length > 32) {
      res.status(400).json({ error: '익명 ID는 1자 이상 32자 이하로 입력해 주세요.' });
      return;
    }

    if (!rawContent || rawContent.length > 1000) {
      res.status(400).json({ error: '본문 내용은 1자 이상 1,000자 이하로 입력해 주세요.' });
      return;
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        anonymous_id: rawId,
        content: rawContent,
        likes: 0,
        author_token: viewerToken ?? null,
      })
      .select('id, anonymous_id, content, likes, author_token, created_at')
      .single();

    if (error || !data) {
      res.status(500).json({ error: `Supabase 저장 오류: ${error?.message || '알 수 없는 오류'}` });
      return;
    }

    res.status(201).json({ post: sanitizePost(data as StoredPost, viewerToken) });
    return;
  }

  res.status(405).json({ error: '허용되지 않은 HTTP 메서드입니다.' });
}
