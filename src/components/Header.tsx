interface HeaderProps {
  onFocusComposer: () => void;
}

export function Header({ onFocusComposer }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#F8F9FA]/95 backdrop-blur-sm border-b border-zinc-200">
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
        >
          오픈 익명 게시판
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
          <a
            href="#feed"
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            전체 피드
          </a>
          <a
            href="#composer"
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            글쓰기
          </a>
          <a
            href="#guide"
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            이용 안내
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onFocusComposer}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            새 글 쓰기
          </button>
        </div>
      </div>
    </header>
  );
}
