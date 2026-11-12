// src/components/CourseInsight.jsx
// 전체 공개 코스의 분석 결과. 규칙으로 계산한 난이도·코스 성격과, AI가 쓴 소개를 나눠 보여줍니다.
// AI 소개가 아직 없으면 ai_state에 따라 분석 중(곧 공개)인지, 운영진 확인 중인지 알려줍니다.
// compact: 탐색기 지도 위 카드처럼 좁은 곳에서는 추천 훈련과 AI 테마·특징만 보여줍니다.
import {
  getDistanceLabel,
  getLevelDescription,
  getLevelLabel,
  getShapeLabel,
  getTerrainLabel,
  getThemeObjects,
  getTrainingLabels,
} from '../utils/insight';
import Icon from './ui/Icon';
import Tooltip from './ui/Tooltip';

const SHAPE_ICONS = { loop: 'loop', out_and_back: 'outback', point_to_point: 'straight' };
const AI_NOTE =
  '경로·고도·주변 장소를 바탕으로 AI가 쓴 글이에요. 신뢰도가 낮은 글은 운영진이 확인한 뒤 보여줘요. 전체 공개 코스에만 있어요. 현장 상황과 다를 수 있으니 참고만 해주세요.';

const AI_STATUS = {
  analyzing: { icon: 'loader', title: 'AI가 코스를 분석하고 있어요', desc: '잠시 후 테마와 코스 소개가 이곳에 표시돼요.' },
  review: { icon: 'clock', title: '운영진이 AI 분석 결과를 확인하고 있어요', desc: '자동 분석의 신뢰도가 낮아 확인을 마친 뒤 코스 소개가 표시돼요.' },
};

const isLevel = (level) => Number.isInteger(level) && level >= 1 && level <= 5;

const DifficultyMeter = ({ level }) => (
  <span className="difficulty-meter" aria-hidden="true">
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} className={i <= level ? 'on' : undefined} />
    ))}
  </span>
);

/** 목록에 쓰는 작은 난이도 표시 */
export const DifficultyBadge = ({ level }) =>
  isLevel(level) ? (
    <span className={`difficulty-badge lv-${level}`} title={`난이도 ${level}단계 (5단계 중)`}>
      <DifficultyMeter level={level} />
      {getLevelLabel(level)}
    </span>
  ) : null;

const CourseInsight = ({ insight, sport, compact = false }) => {
  if (!insight) return null;
  // compact에서는 난이도·형태·지형을 목록의 메타 줄(DifficultyBadge 등)이 이미 보여주므로 뺍니다.
  const level = !compact && isLevel(insight.difficulty) ? insight.difficulty : null;
  const description = level ? getLevelDescription(sport, level) : '';
  const facts = compact
    ? []
    : [
        { icon: 'flag', label: getDistanceLabel(insight.distance) },
        { icon: SHAPE_ICONS[insight.shape], label: SHAPE_ICONS[insight.shape] && getShapeLabel(insight.shape) },
        { icon: 'mountain', label: insight.terrain && getTerrainLabel(insight.terrain) },
      ].filter((fact) => fact.label);
  const training = getTrainingLabels(insight.training);
  const themes = getThemeObjects(insight.themes);
  const hasAi = themes.length > 0 || Boolean(insight.feature) || (!compact && Boolean(insight.route));
  // 좁은 카드(compact)에는 상태 안내를 넣지 않습니다.
  const status = !hasAi && !compact ? AI_STATUS[insight.ai_state] : null;

  if (!level && facts.length === 0 && training.length === 0 && !hasAi && !status) return null;

  return (
    <div className={`insight${compact ? ' insight--compact' : ''}`}>
      {(level || facts.length > 0 || training.length > 0) && (
        <section className={`insight-level${level ? ` lv-${level}` : ''}`} aria-label="코스 난이도">
          {level && (
            <>
              <div className="insight-level__head">
                <span className="insight-level__name">
                  <Icon name="gauge" size={14} />
                  난이도
                </span>
                <strong className="insight-level__value">
                  Lv.{level} {getLevelLabel(level)}
                </strong>
              </div>
              <DifficultyMeter level={level} />
              {!compact && description && <p className="insight-level__desc">{description}</p>}
            </>
          )}
          {(facts.length > 0 || training.length > 0) && (
            <ul className="insight-facts" aria-label="코스 성격">
              {facts.map(({ icon, label }) => (
                <li key={label}>
                  <Icon name={icon} size={13} />
                  {label}
                </li>
              ))}
              {training.map((label) => (
                <li key={label} className="insight-facts__training">
                  <span>추천</span>
                  {label}
                </li>
              ))}
            </ul>
          )}
          {!compact && level && <p className="insight-level__basis">거리와 상승 고도로 계산했어요.</p>}
        </section>
      )}

      {status && (
        <section className="insight-ai insight-ai--status" aria-label="AI 코스 소개" aria-live="polite">
          <div className="insight-ai__head">
            <span className="insight-ai__badge">
              <Icon name="sparkles" size={12} />
              AI 소개
            </span>
          </div>
          <p className="insight-ai__status">
            <Icon name={status.icon} size={14} className={insight.ai_state === 'analyzing' ? 'spin' : undefined} />
            <span>
              <b>{status.title}</b>
              {status.desc}
            </span>
          </p>
        </section>
      )}

      {hasAi && (
        <section className="insight-ai" aria-label="AI 코스 소개">
          <div className="insight-ai__head">
            <span className="insight-ai__badge">
              <Icon name="sparkles" size={12} />
              AI 소개
            </span>
            {!compact && <Tooltip label="AI 소개 설명" content={AI_NOTE} position="bottom-start" />}
          </div>
          {themes.length > 0 && (
            <ul className="insight-themes" aria-label="코스 테마">
              {themes.map(({ label, icon }) => (
                <li key={label}>
                  <Icon name={icon} size={12} />
                  {label}
                </li>
              ))}
            </ul>
          )}
          {insight.feature && <p className="insight-ai__feature">{insight.feature}</p>}
          {!compact && insight.route && (
            <div className="insight-ai__route">
              <span>
                <Icon name="route" size={13} />
                코스 안내
              </span>
              <p>{insight.route}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default CourseInsight;
