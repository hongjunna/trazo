// src/components/PageFrame.jsx
// 상단 메뉴 아래에 보이는 일반 페이지(내 코스·커뮤니티·연동센터)의 공통 틀.
// 대화상자(Dialog)와 같은 title·description·children을 받아, 같은 내용을 대화상자나 페이지로 보여줄 수 있습니다.
const PageFrame = ({ title, description, headerExtra, children, className = '' }) => (
    <section className={`page ${className}`}>
        <div className="page__inner">
            <header className="page__header">
                <div className="page__titles">
                    <h1 className="page__title">{title}</h1>
                    {description && <p className="page__desc">{description}</p>}
                </div>
                {headerExtra}
            </header>
            {children}
        </div>
    </section>
);

export default PageFrame;
