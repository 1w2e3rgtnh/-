import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { createServer as createHttpServer } from 'node:http';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { WebSocketServer, WebSocket } from 'ws';

interface StoredPost {
  id: number;
  anonymous_id: string;
  content: string;
  likes: number;
  author_token?: string | null;
  created_at: string;
}

interface PublicPost {
  id: number;
  anonymous_id: string;
  content: string;
  likes: number;
  created_at: string;
  is_mine?: boolean;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '.data');
const DATA_FILE = path.join(DATA_DIR, 'posts.json');
const ENV_FILE = path.join(__dirname, '.env');
const PORT = 3000;

dotenv.config({ path: ENV_FILE });

let supabase: SupabaseClient | null = null;
let activeSupabaseUrl = '';
let activeSupabaseKey = '';
let broadcastFn: ((message: unknown) => void) | null = null;
let realtimeSubscribed = false;

function readSupabaseCredentials(): { url: string; key: string } {
  let fileEnv: Record<string, string> = {};
  try {
    if (fsSync.existsSync(ENV_FILE)) {
      fileEnv = dotenv.parse(fsSync.readFileSync(ENV_FILE, 'utf-8'));
    }
  } catch {
    // Ignore read errors
  }

  const url = (
    fileEnv.VITE_SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
  const key = (
    fileEnv.VITE_SUPABASE_ANON_KEY ||
    fileEnv.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  return { url, key };
}

function attachRealtimeIfNeeded(client: SupabaseClient) {
  if (realtimeSubscribed || !broadcastFn) return;
  realtimeSubscribed = true;

  client
    .channel('public:posts')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'posts' },
      (change) => {
        if (change.eventType === 'INSERT' && change.new) {
          broadcastFn?.({
            type: 'post:created',
            payload: sanitizePost(change.new as StoredPost),
          });
        } else if (change.eventType === 'UPDATE' && change.new) {
          broadcastFn?.({
            type: 'post:updated',
            payload: sanitizePost(change.new as StoredPost),
          });
        } else if (change.eventType === 'DELETE' && change.old) {
          const oldRecord = change.old as { id?: number };
          if (typeof oldRecord.id === 'number') {
            broadcastFn?.({
              type: 'post:deleted',
              payload: { id: oldRecord.id },
            });
          }
        }
      }
    )
    .subscribe();
}

function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = readSupabaseCredentials();
  const isValid =
    Boolean(url && key) &&
    (url.startsWith('https://') || url.startsWith('http://'));

  if (!isValid) {
    return null;
  }

  if (!supabase || activeSupabaseUrl !== url || activeSupabaseKey !== key) {
    activeSupabaseUrl = url;
    activeSupabaseKey = key;
    realtimeSubscribed = false;
    supabase = createClient(url, key, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    attachRealtimeIfNeeded(supabase);
  }

  return supabase;
}

const SEED_POSTS: StoredPost[] = [
  {
    id: 1,
    anonymous_id: '익명_3814',
    content:
      '새로 열린 익명 게시판 첫 글 남깁니다. 오늘 밤 공기가 꽤 선선해서 산책하기 좋네요.',
    likes: 4,
    author_token: null,
    created_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: 2,
    anonymous_id: '새벽감성',
    content:
      '별명을 직접 입력하거나 랜덤으로 생성해서 바로 글을 올릴 수 있으니 부담 없이 생각 정리하기 좋습니다.',
    likes: 7,
    author_token: null,
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: 3,
    anonymous_id: '익명_9021',
    content:
      '실시간 반영 테스트 중입니다. 다른 창에서 작성한 글도 새로고침 없이 바로 피드에 올라오는지 확인해 보세요.',
    likes: 2,
    author_token: null,
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
];

let writeQueue: Promise<unknown> = Promise.resolve();

function sanitizePost(post: StoredPost, viewerToken?: string): PublicPost {
  return {
    id: post.id,
    anonymous_id: post.anonymous_id,
    content: post.content,
    likes: typeof post.likes === 'number' ? post.likes : 0,
    created_at: post.created_at,
    is_mine: Boolean(viewerToken && post.author_token && post.author_token === viewerToken),
  };
}

async function readLocalPosts(): Promise<StoredPost[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(SEED_POSTS, null, 2), 'utf-8');
    return [...SEED_POSTS];
  }
  return [];
}

async function writeLocalPosts(posts: StoredPost[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(posts, null, 2), 'utf-8');
  await fs.rename(tempFile, DATA_FILE);
}

function enqueueLocalMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => undefined);
  return next;
}

async function listPosts(viewerToken?: string): Promise<PublicPost[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from('posts')
      .select('id, anonymous_id, content, likes, author_token, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => sanitizePost(row as StoredPost, viewerToken));
  }

  const posts = await readLocalPosts();
  return [...posts]
    .sort((a, b) => {
      const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return timeDiff !== 0 ? timeDiff : b.id - a.id;
    })
    .map((post) => sanitizePost(post, viewerToken));
}

async function createPost(
  anonymousId: string,
  content: string,
  authorToken?: string
): Promise<StoredPost> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from('posts')
      .insert({
        anonymous_id: anonymousId,
        content,
        likes: 0,
        author_token: authorToken ?? null,
      })
      .select('id, anonymous_id, content, likes, author_token, created_at')
      .single();

    if (error || !data) {
      throw new Error(error?.message || '게시글 저장에 실패했습니다.');
    }

    return data as StoredPost;
  }

  return enqueueLocalMutation(async () => {
    const posts = await readLocalPosts();
    const maxId = posts.reduce((acc, item) => (item.id > acc ? item.id : acc), 0);
    const created: StoredPost = {
      id: maxId + 1,
      anonymous_id: anonymousId,
      content,
      likes: 0,
      author_token: authorToken ?? null,
      created_at: new Date().toISOString(),
    };
    posts.unshift(created);
    await writeLocalPosts(posts);
    return created;
  });
}

async function updatePostLikes(id: number, delta: number): Promise<StoredPost | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data: existing, error: fetchError } = await client
      .from('posts')
      .select('id, anonymous_id, content, likes, author_token, created_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return null;
    }

    const nextLikes = Math.max(0, (existing.likes ?? 0) + delta);
    const { data, error } = await client
      .from('posts')
      .update({ likes: nextLikes })
      .eq('id', id)
      .select('id, anonymous_id, content, likes, author_token, created_at')
      .single();

    if (error || !data) {
      throw new Error(error?.message || '공감 반영에 실패했습니다.');
    }

    return data as StoredPost;
  }

  return enqueueLocalMutation(async () => {
    const posts = await readLocalPosts();
    const idx = posts.findIndex((item) => item.id === id);
    if (idx === -1) {
      return null;
    }
    const updated: StoredPost = {
      ...posts[idx],
      likes: Math.max(0, posts[idx].likes + delta),
    };
    posts[idx] = updated;
    await writeLocalPosts(posts);
    return updated;
  });
}

async function deletePost(id: number, viewerToken?: string): Promise<'deleted' | 'not_found' | 'forbidden'> {
  const client = getSupabaseClient();
  if (client) {
    const { data: existing, error: fetchError } = await client
      .from('posts')
      .select('id, author_token')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return 'not_found';
    }

    if (existing.author_token && existing.author_token !== viewerToken) {
      return 'forbidden';
    }

    const { error } = await client.from('posts').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }

    return 'deleted';
  }

  return enqueueLocalMutation(async () => {
    const posts = await readLocalPosts();
    const target = posts.find((item) => item.id === id);
    if (!target) {
      return 'not_found';
    }
    if (target.author_token && target.author_token !== viewerToken) {
      return 'forbidden';
    }
    const filtered = posts.filter((item) => item.id !== id);
    await writeLocalPosts(filtered);
    return 'deleted';
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const broadcast = (message: unknown) => {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };
  broadcastFn = broadcast;

  const initialClient = getSupabaseClient();
  if (initialClient) {
    attachRealtimeIfNeeded(initialClient);
  }

  app.get('/api/config', (_req: Request, res: Response) => {
    const { url, key } = readSupabaseCredentials();
    const isValid =
      Boolean(url && key) &&
      (url.startsWith('https://') || url.startsWith('http://'));
    res.json({
      supabaseUrl: isValid ? url : '',
      supabaseAnonKey: isValid ? key : '',
    });
  });

  app.get('/api/posts', async (req: Request, res: Response) => {
    try {
      const viewerToken = req.header('x-author-token') || undefined;
      const posts = await listPosts(viewerToken);
      res.json({ posts });
    } catch (error) {
      console.error('Failed to list posts:', error);
      res.status(500).json({ error: '게시글을 불러오지 못했습니다.' });
    }
  });

  app.post('/api/posts', async (req: Request, res: Response) => {
    try {
      const rawId = typeof req.body?.anonymous_id === 'string' ? req.body.anonymous_id.trim() : '';
      const rawContent = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      const authorToken = req.header('x-author-token') || undefined;

      if (!rawId || rawId.length > 32) {
        res.status(400).json({ error: '익명 ID는 1자 이상 32자 이하로 입력해 주세요.' });
        return;
      }

      if (!rawContent || rawContent.length > 1000) {
        res.status(400).json({ error: '본문 내용은 1자 이상 1,000자 이하로 입력해 주세요.' });
        return;
      }

      const created = await createPost(rawId, rawContent, authorToken);
      const publicForBroadcast = sanitizePost(created);
      broadcast({ type: 'post:created', payload: publicForBroadcast });

      res.status(201).json({ post: sanitizePost(created, authorToken) });
    } catch (error) {
      console.error('Failed to create post:', error);
      res.status(500).json({ error: '게시글 등록 중 오류가 발생했습니다.' });
    }
  });

  app.post('/api/posts/:id/like', async (req: Request, res: Response) => {
    try {
      const postId = Number(req.params.id);
      if (!Number.isInteger(postId) || postId <= 0) {
        res.status(400).json({ error: '유효하지 않은 게시글 번호입니다.' });
        return;
      }

      const rawDelta = req.body?.delta;
      const delta = rawDelta === -1 ? -1 : 1;
      const viewerToken = req.header('x-author-token') || undefined;

      const updated = await updatePostLikes(postId, delta);
      if (!updated) {
        res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        return;
      }

      broadcast({ type: 'post:updated', payload: sanitizePost(updated) });
      res.json({ post: sanitizePost(updated, viewerToken) });
    } catch (error) {
      console.error('Failed to update post likes:', error);
      res.status(500).json({ error: '공감 반영 중 오류가 발생했습니다.' });
    }
  });

  app.delete('/api/posts/:id', async (req: Request, res: Response) => {
    try {
      const postId = Number(req.params.id);
      if (!Number.isInteger(postId) || postId <= 0) {
        res.status(400).json({ error: '유효하지 않은 게시글 번호입니다.' });
        return;
      }

      const viewerToken = req.header('x-author-token') || undefined;
      const result = await deletePost(postId, viewerToken);

      if (result === 'not_found') {
        res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        return;
      }
      if (result === 'forbidden') {
        res.status(403).json({ error: '본인이 작성한 게시글만 삭제할 수 있습니다.' });
        return;
      }

      broadcast({ type: 'post:deleted', payload: { id: postId } });
      res.json({ ok: true });
    } catch (error) {
      console.error('Failed to delete post:', error);
      res.status(500).json({ error: '게시글 삭제 중 오류가 발생했습니다.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
