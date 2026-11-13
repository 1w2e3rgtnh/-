import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Search, Trash2, X, AlertCircle, RotateCcw } from 'lucide-react';
import type { Post } from '../types/post';

type SortOption = 'latest' | 'popular';

interface PostFeedProps {
  posts: Post[];
  loading: boolean;
  error: string | null;
  likedPostIds: Set<number>;
  onRetry: () => void;
  onToggleLike: (postId: number) => void;
  onDeletePost: (postId: number) => Promise<void>;
  onFocusComposer: () => void;
}

function formatRelativeTime(isoDate: string): string {
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 10) return '방금 전';
  if (diffSeconds < 60) return `${diffSeconds}초 전`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}일 전`;

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function PostFeed({
  posts,
  loading,
  error,
  likedPostIds,
  onRetry,
  onToggleLike,
  onDeletePost,
  onFocusComposer,
}: PostFeedProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('latest');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = query
      ? posts.filter(
          (post) =>
            post.anonymous_id.toLowerCase().includes(query) ||
            post.content.toLowerCase().includes(query)
        )
      : posts;

    return [...matched].sort((a, b) => {
      if (sortBy === 'popular') {
        const likeDiff = b.likes - a.likes;
        if (likeDiff !== 0) return likeDiff;
      }
      const timeDiff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return timeDiff !== 0 ? timeDiff : b.id - a.id;
    });
  }, [posts, searchQuery, sortBy]);

  const handleConfirmDelete = async (postId: number) => {
    setDeletingId(postId);
    try {
      await onDeletePost(postId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section id="feed" className="min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 tracking-tight">
            실시간 게시글
          </h2>
          <span className="text-sm text-zinc-500 tabular-nums">
            총 {filteredPosts.length.toLocaleString()}건
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search
              className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="익명 ID 또는 내용 검색"
              aria-label="익명 ID 또는 내용 검색"
              className="w-full min-h-[40px] pl-9 pr-8 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 transition-colors duration-150"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="정렬 기준"
            className="inline-flex items-center p-1 bg-zinc-200/70 rounded-lg shrink-0"
          >
            <button
              type="button"
              onClick={() => setSortBy('latest')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                sortBy === 'latest'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              최신순
            </button>
            <button
              type="button"
              onClick={() => setSortBy('popular')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                sortBy === 'popular'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              공감순
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-4 px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-800 bg-white border border-red-200 hover:bg-red-100/60 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            다시 불러오기
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
          {[0, 1, 2].map((skeleton) => (
            <div key={skeleton} className="p-6 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-4 w-24 bg-zinc-200 rounded" />
                <div className="h-3.5 w-16 bg-zinc-100 rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-zinc-100 rounded" />
                <div className="h-4 w-3/4 bg-zinc-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl px-6 py-16 text-center space-y-4">
          <p className="text-base font-medium text-zinc-900">
            {searchQuery
              ? '검색 조건과 일치하는 게시글이 없습니다.'
              : '아직 작성된 게시글이 없습니다.'}
          </p>
          <p className="text-sm text-zinc-500">
            {searchQuery
              ? '다른 익명 ID나 키워드로 다시 검색해 보세요.'
              : '왼쪽 작성란에서 첫 번째 익명 이야기를 남겨 보세요.'}
          </p>
          <div className="pt-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors duration-150 cursor-pointer"
              >
                검색어 초기화
              </button>
            ) : (
              <button
                type="button"
                onClick={onFocusComposer}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors duration-150 cursor-pointer"
              >
                첫 번째 글 작성하기
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
          <AnimatePresence initial={false}>
            {filteredPosts.map((post) => {
              const isLiked = likedPostIds.has(post.id);
              const isConfirmingDelete = confirmDeleteId === post.id;

              return (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="p-6 hover:bg-zinc-50/70 transition-colors duration-150"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm mb-3">
                    <span className="font-semibold text-zinc-900">
                      {post.anonymous_id}
                    </span>
                    <span className="text-zinc-300" aria-hidden="true">
                      ·
                    </span>
                    <time
                      dateTime={post.created_at}
                      title={new Date(post.created_at).toLocaleString('ko-KR')}
                      className="text-xs text-zinc-500 tabular-nums"
                    >
                      {formatRelativeTime(post.created_at)}
                    </time>
                    <span className="text-zinc-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-xs text-zinc-400 tabular-nums">
                      #{String(post.id).padStart(4, '0')}
                    </span>
                  </div>

                  <p className="text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap break-words max-w-[68ch]">
                    {post.content}
                  </p>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => onToggleLike(post.id)}
                      aria-pressed={isLiked}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap shrink-0 cursor-pointer ${
                        isLiked
                          ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100/70'
                          : 'text-zinc-600 bg-white border-zinc-200 hover:text-zinc-900 hover:bg-zinc-50'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${isLiked ? 'fill-blue-700 text-blue-700' : ''}`}
                        aria-hidden="true"
                      />
                      <span>공감</span>
                      <span className="font-mono tabular-nums">
                        {post.likes.toLocaleString()}
                      </span>
                    </button>

                    {post.is_mine && (
                      <div className="flex items-center gap-2">
                        {isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              disabled={deletingId === post.id}
                              onClick={() => void handleConfirmDelete(post.id)}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {deletingId === post.id ? '삭제 중...' : '삭제 확인'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(post.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:text-red-600 rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            삭제
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
