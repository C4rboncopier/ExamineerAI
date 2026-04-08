interface PaginationProps {
    currentPage: number;
    totalPages: number;
    isDisabled?: boolean;
    onPageChange: (page: number) => void;
}

function getPageNumbers(current: number, total: number): (number | '…')[] {
    const delta = 2;
    const pages: (number | '…')[] = [];
    const left = current - delta;
    const right = current + delta;

    for (let p = 1; p <= total; p++) {
        if (p === 1 || p === total || (p >= left && p <= right)) {
            pages.push(p);
        } else if (pages[pages.length - 1] !== '…') {
            pages.push('…');
        }
    }

    return pages;
}

export function Pagination({ currentPage, totalPages, isDisabled = false, onPageChange }: PaginationProps) {
    const pages = getPageNumbers(currentPage, totalPages);

    return (
        <div className="subjects-pagination">
            <button
                className="pagination-btn"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1 || isDisabled}
            >
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                <span className="pagination-btn-text">Previous</span>
            </button>
            <div className="pagination-pages">
                {pages.map((page, idx) =>
                    page === '…'
                        ? (
                            <span
                                key={`ellipsis-${idx}`}
                                className="pagination-ellipsis"
                            >
                                …
                            </span>
                        )
                        : (
                            <button
                                key={page}
                                className={`pagination-page ${page === currentPage ? 'active' : ''}`}
                                onClick={() => onPageChange(page)}
                                disabled={isDisabled}
                            >
                                {page}
                            </button>
                        )
                )}
            </div>
            <button
                className="pagination-btn"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isDisabled}
            >
                <span className="pagination-btn-text">Next</span>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
            </button>
        </div>
    );
}
