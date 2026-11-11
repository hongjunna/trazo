// src/components/SharedCourseDialog.jsx
// 공유받은 코스(링크 공유·전체 공개)의 전체 모습: 지도, 거리·고도, 고도 차트, 내 코스에 담기.
// 전체 공개 코스는 좋아요와 댓글도 남길 수 있습니다. 열려 있는 동안 주소창은 공유 링크(/c/<토큰>)가 됩니다.
import { useEffect, useMemo, useState } from 'react';
import {
  apiErrorMessage,
  copySharedCourse,
  getSharedCourse,
  setCourseLike,
} from '../api/courseApi';
import { SPORTS } from '../sports';
import { courseStats, locateWaypoints } from '../utils/course';
import {
  VISIBILITY,
  copyText,
  shareUrl,
  sharePath,
  timeAgo,
  visibilityOf,
} from '../utils/share';
import {
  getLevelLabel,
  getLevelDescription,
  getTerrainLabel,
  getShapeLabel,
  getTrainingLabels,
  getThemeLabels,
} from '../utils/insight';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';
import CourseMap from './CourseMap';
import CommentSection from './CommentSection';
import ElevationPanel from './ElevationPanel';
import { FolderPickerDialog } from './FolderSelect';
import { useFeedback } from './ui/feedbackContext';

const Stat = ({ label, value, unit }) => (
  <div className="stat">
    <span className="stat__label">{label}</span>
    <span className="stat__value">
      {value}
      {unit && <span className="stat__unit">{unit}</span>}
    </span>
  </div>
);

// userId: 로그인한 계정(없으면 null). 로그인 상태가 바뀌면 좋아요·내 코스 여부를 다시 받습니다.
// onChange: 담기·좋아요·댓글 수가 바뀌면 커뮤니티 목록에도 알려줍니다.
const SharedCourseDialog = ({
  token,
  userId,
  memberReady,
  ensureMember,
  onOpenCourse,
  onChange,
  onClose,
}) => {
  const { toast, confirm } = useFeedback();
  // 응답을 요청한 토큰·계정과 함께 보관해, 다른 코스나 계정의 응답이 섞이지 않게 합니다.
  const [result, setResult] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(
    () => new URLSearchParams(window.location.search).get('action') === 'save',
  );
  const requestKey = `${token}:${userId ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    getSharedCourse(token)
      .then((response) => {
        if (!cancelled) setResult({ key: requestKey, course: response.data });
      })
      .catch((error) => {
        if (!cancelled) setResult({ key: requestKey, error });
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestKey]);

  // 열려 있는 동안 주소창을 공유 링크로 바꿔 두고, 닫으면 첫 화면 주소로 돌립니다.
  useEffect(() => {
    window.history.replaceState(null, '', sharePath(token));
    return () => window.history.replaceState(null, '', '/');
  }, [token]);

  const course = result?.course;
  const stale = result?.key !== requestKey;
  const sport = SPORTS[course?.sport] ?? SPORTS.bike;
  const stats = useMemo(() => courseStats(course?.polylines ?? []), [course]);
  const waypoints = useMemo(
    () => locateWaypoints(course?.polylines ?? [], course?.waypoints ?? []),
    [course],
  );
  const isPublic = course?.visibility === 'public';

  const patch = (changes) => {
    setResult((prev) => ({ ...prev, course: { ...prev.course, ...changes } }));
    onChange?.({ token, ...changes });
  };

  const handleAdd = async () => {
    setPendingAdd(true);
    if (
      await ensureMember(
        '코스를 내 코스에 담으려면 구글 계정으로 로그인하세요.',
      )
    ) {
      setPendingAdd(false);
      setIsAdding(true);
    }
  };

  // 첫 가입의 닉네임 입력까지 끝나면 선택했던 코스 담기를 이어갑니다.
  useEffect(() => {
    if (pendingAdd && memberReady && course && !course.is_owner && !stale) {
      setPendingAdd(false);
      setIsAdding(true);
    }
  }, [pendingAdd, memberReady, course, stale]);

  const submitAdd = async (folderId) => {
    try {
      const { data } = await copySharedCourse(token, folderId);
      setIsAdding(false);
      patch({ share_count: data.share_count });
      const open = await confirm({
        title: '내 코스에 담았어요',
        message:
          '지금 지도에서 열어볼까요? 내 코스에서 언제든 다시 불러와 고칠 수 있어요.',
        confirmLabel: '지도에서 열기',
        cancelLabel: '계속 둘러보기',
      });
      if (open) onOpenCourse(data.course);
      return true;
    } catch (err) {
      toast(
        apiErrorMessage(
          err,
          '내 코스에 담지 못했어요. 잠시 후 다시 시도하세요.',
        ),
        { tone: 'error' },
      );
      return false;
    }
  };

  const toggleLike = async () => {
    if (
      likeBusy ||
      !(await ensureMember('좋아요를 누르려면 구글 계정으로 로그인하세요.'))
    )
      return;
    setLikeBusy(true);
    try {
      const { data } = await setCourseLike(token, !course.liked);
      patch({ liked: data.liked, like_count: data.like_count });
    } catch (err) {
      toast(
        apiErrorMessage(
          err,
          '좋아요를 반영하지 못했어요. 잠시 후 다시 시도하세요.',
        ),
        { tone: 'error' },
      );
    } finally {
      setLikeBusy(false);
    }
  };

  const handleCopyLink = async () => {
    const ok = await copyText(shareUrl(token));
    toast(
      ok
        ? '링크를 복사했어요.'
        : '복사하지 못했어요. 주소창의 주소를 직접 복사하세요.',
      { tone: ok ? 'success' : 'error' },
    );
  };

  let content;
  if (result?.error && !stale) {
    const notFound = result.error.response?.status === 404;
    content = (
      <div className="empty">
        <Icon name={notFound ? 'lock' : 'alert'} size={32} />
        <span className="empty__title">
          {notFound ? '코스를 볼 수 없어요' : '코스를 불러오지 못했어요'}
        </span>
        <span>
          {notFound
            ? '공유가 해제됐거나 삭제된 코스예요. 링크를 보낸 사람에게 확인해보세요.'
            : '인터넷 연결을 확인하고 다시 시도하세요.'}
        </span>
      </div>
    );
  } else if (!course) {
    content = (
      <div className="viewer" aria-busy="true">
        <div className="skeleton course-map" />
        <div className="skeleton" />
      </div>
    );
  } else {
    const visibility = VISIBILITY[visibilityOf(course)];
    content = (
      <div
        className="viewer"
        style={{ '--sport': sport.color, '--on-sport': sport.onColor }}
      >
        <CourseMap
          polylines={course.polylines}
          markers={course.markers}
          waypoints={waypoints}
          color={sport.color}
          hoverPoint={hoverPoint}
        />
        <div className="viewer__byline">
          <span className="avatar avatar--sm" aria-hidden="true">
            {(course.nickname ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="viewer__author">
            {course.nickname ?? '알 수 없음'}
          </span>
          <span
            className="sport-tag"
            style={{ background: sport.color, color: sport.onColor }}
          >
            <Icon name={sport.icon} size={12} strokeWidth={2.5} />
            {sport.label}
          </span>
          <span
            className={`visibility-tag visibility-tag--${visibilityOf(course)}`}
            title={visibility.desc}
          >
            <Icon name={visibility.icon} size={12} strokeWidth={2.5} />
            {visibility.label}
          </span>
          {course.published_at && isPublic && (
            <span className="viewer__time">{timeAgo(course.published_at)}</span>
          )}
        </div>
        <div className="stats viewer__stats">
          <Stat
            label="거리"
            value={stats.distanceKm.toFixed(stats.distanceKm >= 100 ? 1 : 2)}
            unit="km"
          />
          <Stat
            label="상승 고도"
            value={Math.round(stats.ascentM).toLocaleString()}
            unit="m"
          />
          <Stat
            label="담은 사람"
            value={course.share_count.toLocaleString()}
            unit="명"
          />
        </div>
        {course.insight && (
          <div className="viewer__insight">
            {/* 난이도 표시 */}
            {course.insight.difficulty && (
              <div className="insight-item insight-difficulty">
                <span className="insight-item__label">
                  <Icon name="gauge" size={14} />
                  난이도
                </span>
                <div className="insight-difficulty__content">
                  <span
                    className="insight-difficulty__level"
                    style={{ '--sport': sport.color }}
                  >
                    <span className="insight-difficulty__badge">
                      {getLevelLabel(course.insight.difficulty)}
                    </span>
                    <span className="insight-difficulty__num">
                      Lv.{course.insight.difficulty}
                    </span>
                  </span>
                  <p className="insight-difficulty__desc">
                    {getLevelDescription(
                      course.sport,
                      course.insight.difficulty,
                    )}
                  </p>
                </div>
              </div>
            )}
            {/* 거리 유형, 형태, 지형, 추천 훈련 */}
            {(course.insight.distance ||
              course.insight.shape ||
              course.insight.terrain ||
              course.insight.training?.length) && (
              <div className="insight-item insight-details">
                {course.insight.distance && (
                  <span className="insight-detail">
                    <Icon name="flag" size={13} />
                    {course.insight.distance === 'short'
                      ? '단거리'
                      : course.insight.distance === 'medium'
                        ? '중거리'
                        : course.insight.distance === 'long'
                          ? '장거리'
                          : course.insight.distance === 'granfondo'
                            ? '그란폰도'
                            : course.insight.distance}
                  </span>
                )}
                {course.insight.shape && (
                  <span className="insight-detail">
                    <Icon
                      name={
                        course.insight.shape === 'loop'
                          ? 'loop'
                          : course.insight.shape === 'out_and_back'
                            ? 'out-and-back'
                            : 'point-to-point'
                      }
                      size={13}
                    />
                    {getShapeLabel(course.insight.shape)}
                  </span>
                )}
                {course.insight.terrain && (
                  <span className="insight-detail">
                    <Icon name="mountain" size={13} />
                    {getTerrainLabel(course.insight.terrain)}
                  </span>
                )}
                {course.insight.training?.length && (
                  <span className="insight-detail insight-training">
                    <Icon name="target" size={13} />
                    추천:{' '}
                    {getTrainingLabels(course.insight.training).join(', ')}
                  </span>
                )}
              </div>
            )}
            {/* AI 분석: 테마, 특징, 코스 안내 */}
            {(course.insight.themes?.length ||
              course.insight.feature ||
              course.insight.route) && (
              <div className="insight-item insight-ai">
                {course.insight.themes?.length && (
                  <div className="insight-ai__themes">
                    <span className="insight-ai__label">
                      <Icon name="tag" size={13} />
                      테마
                    </span>
                    <div className="insight-ai__tags">
                      {getThemeLabels(course.insight.themes).map(
                        (theme, idx) => (
                          <span key={idx} className="insight-tag">
                            {theme}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {course.insight.feature && (
                  <div className="insight-ai__feature">
                    <span className="insight-ai__label">
                      <Icon name="sparkles" size={13} />
                      코스 특징
                    </span>
                    <p className="insight-ai__text">{course.insight.feature}</p>
                  </div>
                )}
                {course.insight.route && (
                  <div className="insight-ai__route">
                    <span className="insight-ai__label">
                      <Icon name="map" size={13} />
                      코스 안내
                    </span>
                    <p className="insight-ai__text">{course.insight.route}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="viewer__actions">
          {course.is_owner ? (
            <span className="viewer__note">
              <Icon name="info" size={16} />
              내가 공유한 코스예요. 공개 범위는 내 코스의 공유 설정에서 바꿀 수
              있어요.
            </span>
          ) : (
            <Button variant="primary" icon="folder-plus" onClick={handleAdd}>
              내 코스에 추가
            </Button>
          )}
          {isPublic && (
            <Button
              variant="secondary"
              icon="heart"
              className={`like-btn ${course.liked ? 'like-btn--on' : ''}`}
              aria-pressed={course.liked}
              loading={likeBusy}
              onClick={toggleLike}
              title={course.liked ? '좋아요 취소' : '좋아요'}
            >
              {course.like_count.toLocaleString()}
            </Button>
          )}
          <Button variant="secondary" icon="link" onClick={handleCopyLink}>
            링크 복사
          </Button>
        </div>
        <ElevationPanel
          variant="inline"
          polylines={course.polylines}
          waypoints={waypoints}
          zones={sport.gradeZones}
          onHoverPoint={setHoverPoint}
        />
        {isPublic && (
          <CommentSection
            token={token}
            canWrite={Boolean(userId)}
            onRequireMember={() =>
              ensureMember('댓글을 남기려면 구글 계정으로 로그인하세요.')
            }
            onCountChange={(delta) =>
              patch({ comment_count: course.comment_count + delta })
            }
          />
        )}
      </div>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={course?.title ?? '공유 코스'}
      description={
        course
          ? `${course.nickname ?? '알 수 없음'}님이 공유한 ${sport.label} 코스`
          : undefined
      }
      size="lg"
      initialFocus="dialog"
    >
      {content}
      {isAdding && (
        <FolderPickerDialog
          title="내 코스에 추가"
          description={`'${course.title}'을(를) 담을 폴더를 고르세요.`}
          confirmLabel="추가"
          onSubmit={submitAdd}
          onClose={() => setIsAdding(false)}
        />
      )}
    </Dialog>
  );
};

export default SharedCourseDialog;
