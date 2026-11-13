import { useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { RefreshCw, Send, AlertCircle } from 'lucide-react';

interface PostComposerProps {
  anonymousId: string;
  onChangeAnonymousId: (value: string) => void;
  onGenerateRandomId: () => void;
  onSubmitPost: (anonymousId: string, content: string) => Promise<boolean>;
  idInputRef: RefObject<HTMLInputElement | null>;
  contentInputRef: RefObject<HTMLTextAreaElement | null>;
}

const MAX_ID_LENGTH = 32;
const MAX_CONTENT_LENGTH = 1000;

export function PostComposer({
  anonymousId,
  onChangeAnonymousId,
  onGenerateRandomId,
  onSubmitPost,
  idInputRef,
  contentInputRef,
}: PostComposerProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (submitting) return;

    const trimmedId = anonymousId.trim();
    const trimmedContent = content.trim();

    if (!trimmedId) {
      setValidationError('익명 ID를 입력해 주세요.');
      idInputRef.current?.focus();
      return;
    }

    if (!trimmedContent) {
      setValidationError('본문 내용을 입력해 주세요.');
      contentInputRef.current?.focus();
      return;
    }

    setValidationError(null);
    setSubmitting(true);

    try {
      const ok = await onSubmitPost(trimmedId, trimmedContent);
      if (ok) {
        setContent('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <aside id="composer" className="space-y-6 lg:sticky lg:top-24">
      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-zinc-900 tracking-tight mb-5">
          새 글 작성
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label
                htmlFor="anonymous-id"
                className="text-sm font-medium text-zinc-800"
              >
                익명 ID
              </label>
              <button
                type="button"
                onClick={onGenerateRandomId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200/80 rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                랜덤 ID
              </button>
            </div>
            <input
              ref={idInputRef}
              id="anonymous-id"
              type="text"
              maxLength={MAX_ID_LENGTH}
              value={anonymousId}
              onChange={(e) => {
                onChangeAnonymousId(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="예: 익명_4092 또는 자유 별명"
              className="w-full min-h-[42px] px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 transition-colors duration-150"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label
                htmlFor="post-content"
                className="text-sm font-medium text-zinc-800"
              >
                본문 내용
              </label>
              <span className="font-mono text-xs text-zinc-500 tabular-nums">
                {content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
              </span>
            </div>
            <textarea
              ref={contentInputRef}
              id="post-content"
              rows={6}
              maxLength={MAX_CONTENT_LENGTH}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="지금 떠오르는 생각이나 이야기를 자유롭게 작성해 보세요. 등록 즉시 실시간 피드에 반영됩니다."
              className="w-full px-3.5 py-3 text-[15px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-300 rounded-lg resize-y focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 transition-colors duration-150"
            />
          </div>

          {validationError && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-1">
            <span className="text-xs text-zinc-500">
              Ctrl + Enter로 빠른 등록
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              {submitting ? '등록 중...' : '게시글 등록'}
            </button>
          </div>
        </form>
      </div>

      <section
        id="guide"
        className="px-1 pt-2 border-t border-zinc-200/80 space-y-2.5"
      >
        <h3 className="text-sm font-semibold text-zinc-800">게시판 이용 안내</h3>
        <ul className="space-y-1.5 text-xs leading-relaxed text-zinc-600">
          <li>익명 ID는 매 글마다 자유롭게 변경하거나 랜덤으로 생성할 수 있습니다.</li>
          <li>등록된 게시글과 공감 수는 별도 새로고침 없이 모든 화면에 실시간으로 반영됩니다.</li>
          <li>타인에 대한 비방이나 개인정보가 포함된 글은 작성을 자제해 주세요.</li>
        </ul>
      </section>
    </aside>
  );
}
