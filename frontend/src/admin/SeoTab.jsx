// src/admin/SeoTab.jsx
// SEO 테스트: 검색어를 넣으면 전체 공개 코스 페이지를 검색엔진이 읽는 제목·설명·본문으로 채점해 검색 결과처럼 보여줍니다.
// 실제 순위가 아니라 '우리 페이지가 이 검색어를 담고 있는지'를 확인하는 도구이고, 실제 결과는 각 검색엔진 버튼으로 엽니다.
import { useState } from 'react';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import { getSeoSearch, isUnauthorized } from './adminApi';

const SITE = 'trazo.runvia.app';
const ENGINES = [
    { id: 'google', label: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { id: 'naver', label: 'NAVER', url: (q) => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}` },
    { id: 'bing', label: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
];
const EXAMPLES = ['수원 러닝 코스 추천', '광교 근처 러닝 코스', '영통 러닝 코스', '순환런 추천', '5km 평지 러닝 코스', '춘천 그란폰도 gpx'];
const FIELD_LABELS = { title: '제목', description: '설명', body: '본문', data: '코스 데이터' };

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 검색 결과처럼 맞은 낱말을 굵게 표시합니다.
const Highlight = ({ text, terms }) => {
    const words = terms.filter(term => term && term.length >= 1);
    if (!words.length) return text;
    const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
    return text.split(pattern).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
};

const QueryReading = ({ query }) => {
    const parts = [
        query.terms.length > 0 && <span key="t">지역·장소·이름 {query.terms.map(t => <code key={t}>{t}</code>)}</span>,
        query.concepts.length > 0 && <span key="c">조건 {query.concepts.map(c => <code key={c}>{c}</code>)}</span>,
        query.distance && <span key="d">거리 <code>{query.distance}km</code></span>,
        query.ignored.length > 0 && <span key="i" className="seo-reading__ignored">순위에 영향 없는 말 {query.ignored.join(', ')}</span>,
    ].filter(Boolean);
    return <p className="seo-reading">검색어 해석: {parts.length ? parts : '알아들은 낱말이 없어요'}</p>;
};

const Result = ({ item, rank, engine, terms }) => {
    const path = item.url.replace(`https://${SITE}`, '').split('/').filter(Boolean);
    return (
        <li className={`seo-result seo-result--${engine}`}>
            <div className="seo-result__site">
                <span className="seo-result__favicon">T</span>
                <span>
                    <span className="seo-result__name">Trazo</span>
                    <span className="seo-result__url">{SITE} › {path.join(' › ')}</span>
                </span>
                <span className="seo-result__rank">#{rank}</span>
            </div>
            <a className="seo-result__title" href={item.url} target="_blank" rel="noreferrer">
                <Highlight text={item.title} terms={terms} />
            </a>
            <p className="seo-result__desc"><Highlight text={item.description} terms={terms} /></p>
            <div className="seo-result__meta">
                <span className="seo-score" title="검색어와 맞는 정도 (제목 3점·설명 2점·본문 1점, 빠진 낱말이 있으면 깎임)">
                    <span className="seo-score__bar"><span style={{ width: `${Math.round(item.coverage * 100)}%` }} /></span>
                    일치 {Math.round(item.coverage * 100)}% · {item.score}점
                </span>
                {item.matched.map(m => (
                    <span key={m.term} className="seo-term seo-term--hit" title={`${FIELD_LABELS[m.field] ?? m.field}에서 찾음`}>
                        <Icon name="check" size={12} />{m.term}<small>{FIELD_LABELS[m.field] ?? m.field}</small>
                    </span>
                ))}
                {item.missing.map(term => (
                    <span key={term} className="seo-term seo-term--miss" title="페이지에 없음"><Icon name="x" size={12} />{term}</span>
                ))}
                {item.notes.map(note => <span key={note} className="seo-note">{note}</span>)}
                {item.ai_state === 'analyzing' && <span className="seo-note">AI 소개 분석 중</span>}
            </div>
            {item.checks.length > 0 && (
                <ul className="seo-checks">
                    {item.checks.map(check => <li key={check}><Icon name="info" size={13} />{check}</li>)}
                </ul>
            )}
        </li>
    );
};

const SeoTab = ({ onUnauthorized }) => {
    const [engine, setEngine] = useState('google');
    const [text, setText] = useState('');
    const [state, setState] = useState({ loading: false, data: null, error: null });
    const engineInfo = ENGINES.find(e => e.id === engine);

    const run = async (query) => {
        const q = query.trim();
        if (!q) return;
        setText(q);
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const { data } = await getSeoSearch(q);
            setState({ loading: false, data, error: null });
        } catch (error) {
            if (isUnauthorized(error)) onUnauthorized();
            setState({ loading: false, data: null, error });
        }
    };

    const { data, loading, error } = state;
    const terms = data ? [...data.query.terms, ...data.query.concepts, ...data.results.flatMap(r => r.matched.map(m => m.term))] : [];

    return (
        <section className="seo-test" aria-label="SEO 테스트">
            <div className="seo-engines" role="tablist" aria-label="검색엔진 모양">
                {ENGINES.map(e => (
                    <button key={e.id} type="button" role="tab" aria-selected={engine === e.id}
                        className={`seo-engine seo-engine--${e.id}`} onClick={() => setEngine(e.id)}>
                        {e.label}
                    </button>
                ))}
            </div>
            <form className={`seo-box seo-box--${engine}`} onSubmit={(event) => { event.preventDefault(); run(text); }}>
                <Icon name="search" size={20} />
                <input type="search" value={text} onChange={e => setText(e.target.value)}
                    placeholder="예: 수원 러닝 코스 추천" aria-label="검색어" autoFocus />
                <Button type="submit" variant="primary" loading={loading}>검색</Button>
            </form>
            <div className="seo-examples">
                {EXAMPLES.map(example => (
                    <button key={example} type="button" className="admin-chip" onClick={() => run(example)}>{example}</button>
                ))}
            </div>

            {data && (
                <>
                    <QueryReading query={data.query} />
                    <div className="seo-live">
                        <span>실제 검색 결과 보기</span>
                        <a href={engineInfo.url(text)} target="_blank" rel="noreferrer">
                            <Icon name="globe" size={14} />{engineInfo.label}에서 검색
                        </a>
                        <a href={engineInfo.url(`site:${SITE} ${text}`)} target="_blank" rel="noreferrer">
                            <Icon name="search" size={14} />우리 사이트에서만 (site:)
                        </a>
                        <a href={engineInfo.url(`site:${SITE}`)} target="_blank" rel="noreferrer">
                            <Icon name="link" size={14} />색인된 페이지 전체
                        </a>
                    </div>
                    <p className="admin-muted seo-count">
                        전체 공개 코스 페이지 {data.indexed}개 중 {data.total}개가 이 검색어와 맞아요
                        {data.total > data.results.length && ` (상위 ${data.results.length}개 표시)`}.
                    </p>
                    {data.results.length > 0 ? (
                        <ol className="seo-results">
                            {data.results.map((item, i) => (
                                <Result key={item.token} item={item} rank={i + 1} engine={engine} terms={terms} />
                            ))}
                        </ol>
                    ) : (
                        <div className="admin-empty seo-empty">
                            <p><b>이 검색어에 맞는 우리 페이지가 없어요.</b></p>
                            <p>검색어의 지역·장소를 지나는 전체 공개 코스가 있어야 이 검색어로 들어올 수 있어요.</p>
                        </div>
                    )}
                </>
            )}
            {error && <p className="admin-error">검색하지 못했어요.</p>}

            <p className="seo-disclaimer">
                <Icon name="info" size={14} />
                <span>
                    검색엔진이 읽는 것과 같은 페이지 제목·설명·본문으로 채점한 <b>모의 검색</b>이에요. 실제 순위는 색인 여부, 다른 사이트와의 경쟁,
                    링크·클릭 신호에 따라 달라지니 위의 실제 검색 버튼과 Search Console로 함께 확인하세요.
                </span>
            </p>
        </section>
    );
};

export default SeoTab;
