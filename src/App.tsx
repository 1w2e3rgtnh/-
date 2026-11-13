import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { PostComposer } from './components/PostComposer';
import { PostFeed } from './components/PostFeed';
import type { Post, RealtimeEvent } from './types/post';

const AUTHOR_TOKEN_KEY = 'anon_board_author_token';
const SAVED_ID_KEY = 'anon_board_anonymous_id';
const LIKED_POSTS_KEY = 'anon_board_liked_posts';

function generateRandomAnonymousId(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `익명_${num}`;
}

function getOrCreateAuthorToken(): string {
  try {
    const existing = localStorage.getItem(AUTHOR_TOKEN_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(AUTHOR_TOKEN_KEY, generated);
    return generated;
  } catch {
    return `${Date.now()}`;
  }
}

function loadLikedPostIds(): Set<number> {
  try {
    const raw = localStorage.getItem(LIKED_POSTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id) => typeof id === 'number'));
    }
  } catch {
    return new Set();
  }
  return new Set();
}

export default function App() {
  const [authorToken] = useState<string>(() => getOrCreateAuthorToken());
  const [anonymousId, setAnonymousId] = useState<string>(() => {
    try {
      return sessionStorage.getItem(SAVED_ID_KEY) || generateRandomAnonymousId();
    } catch {
      return generateRandomAnonymousId();
    }
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<number>>(() => loadLikedPostIds());

  const idInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleChangeAnonymousId = (value: string) => {
    setAnonymousId(value);
    try {
      sessionStorage.setItem(SAVED_ID_KEY, value);
    } catch {
      // Ignore storage failures
    }
  };

  const handleGenerateRandomId = () => {
    handleChangeAnonymousId(generateRandomAnonymousId());
  };

  const fetchPosts = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/posts', {
        headers: {
          'x-author-token': authorToken,
        },
      });
      if (!response.ok) {
        throw new Error('게시글 목록을 불러오는 데 실패했습니다.');
      }
      const data = (await response.json()) as { posts?: Post[] };
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '게시글을 불러오는 중 오류가 발생했습니다.'
      );
    } finally {
      setLoading(false);
    }
  }, [authorToken]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  // Tick relative timestamps cleanly every 30 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Real-time WebSocket subscription with idempotent state reconciliation
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let unmounted = false;
    let attempts = 0;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (attempts > 0) {
          void fetchPosts();
        }
        attempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as RealtimeEvent;

          if (message.type === 'post:created') {
            setPosts((prev) => {
              if (prev.some((item) => item.id === message.payload.id)) {
                return prev;
              }
              return [message.payload, ...prev];
            });
          } else if (message.type === 'post:updated') {
            setPosts((prev) =>
              prev.map((item) =>
                item.id === message.payload.id
                  ? { ...message.payload, is_mine: item.is_mine }
                  : item
              )
            );
          } else if (message.type === 'post:deleted') {
            setPosts((prev) => prev.filter((item) => item.id !== message.payload.id));
          }
        } catch {
          // Ignore malformed event payloads
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        attempts += 1;
        const delay = Math.min(10000, 1000 * Math.pow(1.5, attempts));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      ws?.close();
    };
  }, [fetchPosts]);

  const handleSubmitPost = async (
    trimmedId: string,
    trimmedContent: string
  ): Promise<boolean> => {
    setError(null);
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-author-token': authorToken,
        },
        body: JSON.stringify({
          anonymous_id: trimmedId,
          content: trimmedContent,
        }),
      });

      const data = (await response.json()) as { post?: Post; error?: string };
      if (!response.ok || !data.post) {
        setError(data.error || '게시글 등록에 실패했습니다.');
        return false;
      }

      const createdPost = data.post;
      setPosts((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === createdPost.id);
        if (existingIndex !== -1) {
          const next = [...prev];
          next[existingIndex] = createdPost;
          return next;
        }
        return [createdPost, ...prev];
      });
      return true;
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      return false;
    }
  };

  const handleToggleLike = async (postId: number) => {
    const alreadyLiked = likedPostIds.has(postId);
    const delta = alreadyLiked ? -1 : 1;

    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (alreadyLiked) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      try {
        localStorage.setItem(LIKED_POSTS_KEY, JSON.stringify([...next]));
      } catch {
        // Ignore storage errors
      }
      return next;
    });

    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, likes: Math.max(0, post.likes + delta) }
          : post
      )
    );

    try {
      const response = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-author-token': authorToken,
        },
        body: JSON.stringify({ delta }),
      });
      if (response.ok) {
        const data = (await response.json()) as { post?: Post };
        if (data.post) {
          setPosts((prev) =>
            prev.map((item) =>
              item.id === data.post!.id
                ? { ...data.post!, is_mine: item.is_mine }
                : item
            )
          );
        }
      }
    } catch {
      // Revert optimistic count if network call fails
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, likes: Math.max(0, post.likes - delta) }
            : post
        )
      );
    }
  };

  const handleDeletePost = async (postId: number) => {
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'x-author-token': authorToken,
        },
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error || '게시글 삭제에 실패했습니다.');
        return;
      }
      setPosts((prev) => prev.filter((item) => item.id !== postId));
    } catch {
      setError('게시글 삭제 중 네트워크 오류가 발생했습니다.');
    }
  };

  const handleFocusComposer = () => {
    contentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    contentInputRef.current?.focus();
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F8F9FA] text-zinc-900">
      <Header onFocusComposer={handleFocusComposer} />

      <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <section className="mb-8 sm:mb-10 pb-8 border-b border-zinc-200">
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 max-w-2xl"
            style={{ textWrap: 'balance' }}
          >
            자유롭게 남기는 실시간 익명 게시판
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-zinc-600 max-w-2xl">
            익명 ID와 본문을 입력하면 모든 접속자의 화면에 즉시 공유됩니다. 별도의 로그인 없이 생각을 기록하고 다른 사람들의 이야기에 공감해 보세요.
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-5 xl:col-span-4">
            <PostComposer
              anonymousId={anonymousId}
              onChangeAnonymousId={handleChangeAnonymousId}
              onGenerateRandomId={handleGenerateRandomId}
              onSubmitPost={handleSubmitPost}
              idInputRef={idInputRef}
              contentInputRef={contentInputRef}
            />
          </div>

          <div className="lg:col-span-7 xl:col-span-8">
            <PostFeed
              posts={posts}
              loading={loading}
              error={error}
              likedPostIds={likedPostIds}
              onRetry={() => void fetchPosts()}
              onToggleLike={(id) => void handleToggleLike(id)}
              onDeletePost={handleDeletePost}
              onFocusComposer={handleFocusComposer}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white/60">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <span>오픈 익명 게시판</span>
          <span>익명 ID 기반 실시간 커뮤니티 피드</span>
        </div>
      </footer>
    </div>
  );
}
