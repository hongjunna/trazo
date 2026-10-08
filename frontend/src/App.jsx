// src/App.jsx
// 화면 구성: 데스크톱은 왼쪽 사이드바 + 지도 + 아래 고도 패널, 모바일은 전체 화면 지도 + 위쪽 바 + 아래 시트입니다.
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Map, MapMarker, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';
import { onAuthStateChanged } from 'firebase/auth';

import { markerIcons, HOVER_MARKER_ICON } from './constants';
import { useHistoryState } from './hooks/useHistoryState';
import { useIsMobile } from './hooks/useMediaQuery';
import { useNickname } from './hooks/useNickname';
import { fetchRoutePath, saveCourse, downloadTCX, updateCourse, apiErrorMessage } from './api/courseApi';
import { auth, loginWithGoogle, logout, authErrorMessage } from './firebase';
import { SPORTS, SPORT_IDS, isSport, defaultRouteOptions } from './sports';
import { buildGpx, buildTrackIndex, courseStats, distanceKm, distanceMarkers, flattenCourse, nearestOnTrack, safeFileName } from './utils/course';
import { readStored, writeStored } from './utils/storage';
import { shareTokenFromPath, visibilityOf } from './utils/share';
import { COLORS } from './styles/theme';

import AccountButton from './components/AccountButton';
import BottomSheet from './components/BottomSheet';
import { CourseSummary, CourseSettings } from './components/CoursePanel';
import CourseLibrary from './components/CourseLibrary';
import ElevationPanel from './components/ElevationPanel';
import { MapContextMenu, MapControls, MapHint, RouteStatus } from './components/MapOverlays';
import RoutingHelpDialog from './components/RoutingHelpDialog';
import SaveCourseDialog from './components/SaveCourseDialog';
import ShareDialog from './components/ShareDialog';
import SharedCourseDialog from './components/SharedCourseDialog';
import CommunityDialog from './components/CommunityDialog';
import NicknameDialog from './components/NicknameDialog';
import SportPicker from './components/SportPicker';
import Button from './components/ui/Button';
import SegmentedControl from './components/ui/SegmentedControl';
import { useFeedback } from './components/ui/feedbackContext';
import trazoMark from './assets/trazo-mark.svg';

const storedSport = readStored('trazo:sport', null);
const storedView = readStored('trazo:view', null);
const INITIAL_VIEW = storedView && Number.isFinite(storedView.lat) && Number.isFinite(storedView.lng)
  ? { center: { lat: storedView.lat, lng: storedView.lng }, level: Number.isInteger(storedView.level) ? storedView.level : 5 }
  : { center: { lat: 37.521285, lng: 126.999852 }, level: 5 };
// 공유 링크(/c/<토큰>)로 들어오면 공유받은 코스부터 보여줍니다.
const INITIAL_SHARE_TOKEN = shareTokenFromPath(window.location.pathname);

const initialRouteOptions = () => {
  const stored = readStored('trazo:routeOptions', {});
  return Object.fromEntries(SPORT_IDS.map(id => [id, { ...defaultRouteOptions(id), ...(stored[id] || {}) }]));
};
const initialSpeeds = () => {
  const stored = readStored('trazo:speedKmh', {});
  return Object.fromEntries(SPORT_IDS.map(id => [id, Number.isFinite(stored[id]) ? stored[id] : SPORTS[id].defaultSpeedKmh]));
};

const EMPTY_COURSE = { markers: [], polylines: [] };
const SPORT_OPTIONS = SPORT_IDS.map(id => ({ value: id, label: SPORTS[id].label, icon: SPORTS[id].icon }));

// 지도에서 코스를 훑을 때 고도 차트에 위치(km)를 알려주는 작은 통로. 차트만 다시 그리고 App은 다시 그리지 않습니다.
const createHoverBus = () => {
  const listeners = new Set();
  return {
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    emit: (km) => listeners.forEach(listener => listener(km)),
  };
};

// index번 점의 앞뒤 점. 순환 코스의 출발·도착점은 같은 점이라 함께 움직이고, 반대쪽 구간과 이어집니다.
const markerNeighbors = (markers, index, isLoop) => {
  const n = markers.length;
  const loopEnd = isLoop && n > 2 && (index === 0 || index === n - 1);
  return {
    loopEnd,
    prev: index > 0 ? index - 1 : loopEnd ? n - 2 : null,
    next: index < n - 1 ? index + 1 : loopEnd ? 1 : null,
  };
};

// 지도 위 코스 편집 손잡이: 마우스는 바로 끌고, 터치는 꾹 누른 뒤 끕니다.
const GRAB_PX = { mouse: 14, touch: 24 };
const HOVER_PX = 40;
const LONG_PRESS_MS = 450;

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const Brand = ({ compact = false }) => (
  <div className="brand">
    <span className="brand__mark"><img src={trazoMark} alt="" /></span>
    {!compact && (
      <span className="brand__text">
        <span className="brand__name">Trazo</span>
        <span className="brand__tagline">점을 찍어 그리는 나만의 코스</span>
      </span>
    )}
    {compact && <span className="sr-only">Trazo</span>}
  </div>
);

function App() {
  const { toast, confirm } = useFeedback();
  const isMobile = useIsMobile();

  // --- 계정 ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [authBusy, setAuthBusy] = useState(false);
  const { nickname, nicknameRef, setNickname, loadNickname } = useNickname();
  const [isNicknameEditOpen, setIsNicknameEditOpen] = useState(false);

  // --- 커뮤니티 · 공유 ---
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [sharedToken, setSharedToken] = useState(INITIAL_SHARE_TOKEN);
  const [shareTarget, setShareTarget] = useState(null); // 저장 직후 공유 설정을 보여줄 코스

  // --- 지도 ---
  const [map, setMap] = useState(null);
  const mapAreaRef = useRef(null);
  const hoverMarkerRef = useRef(null);
  const [hoverBus] = useState(createHoverBus);
  const [isSatellite, setIsSatellite] = useState(() => readStored('trazo:satellite', false) === true);
  const [myLocation, setMyLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // --- 종목과 길찾기 설정 ---
  const [sport, setSport] = useState(isSport(storedSport) ? storedSport : 'bike');
  // 처음 방문하면 종목부터 고르게 합니다. 한 번 고른 뒤에는 종목 선택 화면을 닫을 수 있습니다.
  const [hasPickedSport, setHasPickedSport] = useState(isSport(storedSport));
  const [isSportPickerOpen, setIsSportPickerOpen] = useState(!isSport(storedSport) && !INITIAL_SHARE_TOKEN);
  const [routeOptionsBySport, setRouteOptionsBySport] = useState(initialRouteOptions);
  const [speedBySport, setSpeedBySport] = useState(initialSpeeds);
  const [isAutoRouting, setIsAutoRouting] = useState(true);
  const currentSport = SPORTS[sport];

  // --- 코스 ---
  const routeRequestRef = useRef(null);
  const savingRef = useRef(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingTcx, setIsExportingTcx] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const { currentState, pushState, undo, redo, reset, canUndo, canRedo } = useHistoryState(EMPTY_COURSE, () => Boolean(routeRequestRef.current || savingRef.current));
  const { markers: currentMarkers, polylines: currentPolylines } = currentState;

  const [title, setTitle] = useState(null); // null이면 종목 기본 이름을 보여줍니다.
  const [currentId, setCurrentId] = useState(null);
  // 저장된 코스의 폴더·공개 범위. 다시 저장할 때 기본값으로 씁니다.
  const [currentMeta, setCurrentMeta] = useState(null);
  const [savedState, setSavedState] = useState({ course: JSON.stringify(EMPTY_COURSE), sport, title: null });
  const displayTitle = title ?? currentSport.defaultTitle;
  const hasMarkers = currentMarkers.length > 0;
  const hasCourse = currentMarkers.length >= 2;
  const isModified = JSON.stringify(currentState) !== savedState.course
    || (hasMarkers && sport !== savedState.sport)
    || (Boolean(currentId) && title !== savedState.title);

  // --- 화면 상태 ---
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isElevationOpen, setIsElevationOpen] = useState(() => readStored('trazo:elevationOpen', true));
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetPeek, setSheetPeek] = useState(180);

  const stats = useMemo(() => courseStats(currentPolylines), [currentPolylines]);
  const kmMarkers = useMemo(() => distanceMarkers(currentPolylines, currentSport.distanceMarkerKm), [currentPolylines, currentSport.distanceMarkerKm]);
  const icons = useMemo(() => markerIcons(currentSport.color), [currentSport.color]);
  const isBusy = isRouting || isSaving;
  const trackIndex = useMemo(() => buildTrackIndex(currentPolylines), [currentPolylines]);
  const first = currentMarkers[0];
  const last = currentMarkers.at(-1);
  const isLoop = hasCourse && first.lat === last.lat && first.lng === last.lng;

  // --- 지도 위 코스 편집 ---
  const [dragPreview, setDragPreview] = useState(null);
  const [mapMenu, setMapMenu] = useState(null); // 우클릭 메뉴: { point, x, y, width, height }
  const closeMapMenu = useCallback(() => setMapMenu(null), []);
  const suppressClickUntilRef = useRef(0);
  const editRef = useRef(null);

  // 고도 차트를 훑을 때 지도에 위치를 보여주는 점
  useEffect(() => {
    if (!map) return;
    const markerImage = new window.kakao.maps.MarkerImage(
      HOVER_MARKER_ICON,
      new window.kakao.maps.Size(24, 24),
      { offset: new window.kakao.maps.Point(12, 12) }
    );
    const marker = new window.kakao.maps.Marker({ position: map.getCenter(), image: markerImage, zIndex: 100 });
    marker.setMap(map);
    marker.setVisible(false);
    hoverMarkerRef.current = marker;
    return () => marker.setMap(null);
  }, [map]);

  // 사이드바·고도 패널·시트 크기가 바뀌면 지도 크기를 다시 계산합니다.
  useEffect(() => {
    const node = mapAreaRef.current;
    if (!map || !node) return;
    const observer = new ResizeObserver(() => map.relayout());
    observer.observe(node);
    return () => observer.disconnect();
  }, [map, isMobile]);

  // 일반 지도와 위성 지도(지명·도로 이름 포함)를 바꿔 보여주고,
  // 자전거 코스에서만 카카오 자전거 지도(자전거도로 표시)를 겹쳐 보여줍니다.
  useEffect(() => {
    if (!map) return;
    const { MapTypeId } = window.kakao.maps;
    map.setMapTypeId(isSatellite ? MapTypeId.HYBRID : MapTypeId.ROADMAP);
    map.removeOverlayMapTypeId(MapTypeId.BICYCLE);
    if (currentSport.showBicycleOverlay) map.addOverlayMapTypeId(MapTypeId.BICYCLE);
  }, [map, isSatellite, currentSport.showBicycleOverlay]);

  const handleToggleSatellite = () => {
    setIsSatellite(on => {
      writeStored('trazo:satellite', !on);
      return !on;
    });
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isModified) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isModified]);

  const fitToPoints = useCallback((points) => {
    if (!map || !points.length) return;
    const bounds = new window.kakao.maps.LatLngBounds();
    points.forEach(point => bounds.extend(new window.kakao.maps.LatLng(point.lat, point.lng)));
    const bottom = isMobile ? sheetPeek + 24 : 48;
    map.setBounds(bounds, isMobile ? 90 : 48, isMobile ? 64 : 80, bottom, isMobile ? 24 : 48);
  }, [map, isMobile, sheetPeek]);

  // --- 길찾기 ---
  const cancelRoute = () => {
    routeRequestRef.current?.abort();
    routeRequestRef.current = null;
    setIsRouting(false);
    setRouteError(null);
  };
  useEffect(() => () => routeRequestRef.current?.abort(), []);

  useEffect(() => {
    if (!isRouting) return;
    const onKey = (event) => { if (event.key === 'Escape') cancelRoute(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRouting]);

  const enabledRouteOptions = Object.entries(routeOptionsBySport[sport]).filter(([, on]) => on).map(([id]) => id);

  const routeMode = isAutoRouting ? 'turn-by-turn' : 'straight';
  // 점 표시를 실제 길 위(경로의 시작·끝)로 옮겨, 찍은 점이 어느 길에 붙었는지 바로 보이게 합니다.
  const onRoad = (point) => ({ lat: point.lat, lng: point.lng });

  // 길찾기를 한 번에 하나만 진행하고, 끝나면 build가 돌려준 코스를 기록합니다. 취소되면 아무것도 바꾸지 않습니다.
  const runRouting = async (build, onError) => {
    if (routeRequestRef.current || savingRef.current) return;
    setRouteError(null);
    const controller = new AbortController();
    routeRequestRef.current = controller;
    setIsRouting(true);
    try {
      const next = await build(controller.signal);
      if (routeRequestRef.current !== controller || controller.signal.aborted) return;
      pushState(next);
    } catch {
      if (routeRequestRef.current === controller && !controller.signal.aborted) onError();
    } finally {
      if (routeRequestRef.current === controller) {
        routeRequestRef.current = null;
        setIsRouting(false);
      }
    }
  };

  const findRoute = (from, to, mode, signal) => fetchRoutePath(from, to, { mode, sport, options: enabledRouteOptions }, signal);

  const addPoint = (newPoint, mode = routeMode) => {
    if (routeRequestRef.current || savingRef.current) return;
    if (!currentMarkers.length) {
      setRouteError(null);
      pushState({ markers: [newPoint], polylines: [] });
      return;
    }
    runRouting(async (signal) => {
      const segment = await findRoute(currentMarkers.at(-1), newPoint, mode, signal);
      // 출발점으로 복귀할 때는 순환 코스로 인식되도록 출발점 좌표를 그대로 씁니다.
      const closesLoop = newPoint.lat === currentMarkers[0].lat && newPoint.lng === currentMarkers[0].lng;
      const markers = currentMarkers.length === 1 ? [onRoad(segment[0])] : [...currentMarkers];
      markers.push(closesLoop ? markers[0] : onRoad(segment.at(-1)));
      return { markers, polylines: [...currentPolylines, segment] };
    }, () => setRouteError({
      point: newPoint,
      mode,
      message: mode === 'straight'
        ? '고도 정보를 가져오지 못했어요. 인터넷 연결을 확인하고 다시 시도하세요.'
        : `${currentSport.label} 길을 찾지 못했어요. 다시 시도하거나 직선으로 이어보세요.`,
    }));
  };

  const editFailed = () => toast(routeMode === 'straight'
    ? '고도 정보를 가져오지 못해 코스를 고치지 못했어요. 인터넷 연결을 확인하세요.'
    : `${currentSport.label} 길을 찾지 못해 코스를 고치지 못했어요. 조금 다른 곳으로 옮겨보세요.`, { tone: 'error' });

  // 이미 찍은 점을 옮기고, 그 점에 이어진 앞뒤 길을 다시 찾습니다.
  const moveMarker = (index, point) => {
    if (currentMarkers.length === 1) {
      pushState({ markers: [point], polylines: [] });
      return;
    }
    const n = currentMarkers.length;
    const { loopEnd, prev, next } = markerNeighbors(currentMarkers, index, isLoop);
    const mode = routeMode;
    runRouting(async (signal) => {
      const [incoming, outgoing] = await Promise.all([
        prev != null ? findRoute(currentMarkers[prev], point, mode, signal) : null,
        next != null ? findRoute(point, currentMarkers[next], mode, signal) : null,
      ]);
      const moved = onRoad(incoming ? incoming.at(-1) : outgoing[0]);
      const markers = [...currentMarkers];
      markers[index] = moved;
      if (loopEnd) { markers[0] = moved; markers[n - 1] = moved; }
      const polylines = [...currentPolylines];
      if (incoming) polylines[index > 0 ? index - 1 : n - 2] = incoming;
      if (outgoing) polylines[index < n - 1 ? index : 0] = outgoing;
      return { markers, polylines };
    }, editFailed);
  };

  // 길 중간을 잡아 끌면 그 자리에 새 경유점을 넣고, 그 구간을 둘로 나눠 다시 찾습니다.
  const insertPoint = (segmentIndex, point) => {
    const from = currentMarkers[segmentIndex];
    const to = currentMarkers[segmentIndex + 1];
    if (!from || !to) return;
    const mode = routeMode;
    runRouting(async (signal) => {
      const [before, after] = await Promise.all([findRoute(from, point, mode, signal), findRoute(point, to, mode, signal)]);
      const markers = [...currentMarkers];
      markers.splice(segmentIndex + 1, 0, onRoad(before.at(-1)));
      const polylines = [...currentPolylines];
      polylines.splice(segmentIndex, 1, before, after);
      return { markers, polylines };
    }, editFailed);
  };

  const handleMapClick = (_target, event) => {
    // 코스를 끌어 고친 직후 따라오는 클릭은 점을 찍지 않습니다.
    if (isSportPickerOpen || Date.now() < suppressClickUntilRef.current) return;
    // 우클릭 메뉴가 열려 있으면 지도를 눌러도 메뉴만 닫습니다.
    if (mapMenu) { setMapMenu(null); return; }
    // 모바일에서 시트를 펼친 상태로 지도를 누르면 먼저 시트만 접습니다.
    if (isMobile && sheetExpanded) { setSheetExpanded(false); return; }
    addPoint({ lat: event.latLng.getLat(), lng: event.latLng.getLng() });
  };

  // 데스크톱에서 지도를 우클릭하면 그 위치의 로드뷰를 여는 메뉴를 보여줍니다.
  const handleMapRightClick = (_target, event) => {
    const node = mapAreaRef.current;
    if (isMobile || isSportPickerOpen || !node) return;
    setMapMenu({
      point: { lat: event.latLng.getLat(), lng: event.latLng.getLng() },
      x: event.point.x,
      y: event.point.y,
      width: node.clientWidth,
      height: node.clientHeight,
    });
  };

  const handleMapIdle = (target) => {
    const center = target.getCenter();
    writeStored('trazo:view', { lat: center.getLat(), lng: center.getLng(), level: target.getLevel() });
  };

  // 마지막 점에서 출발점까지 길을 찾아 순환 코스를 만듭니다.
  const handleCloseLoop = () => {
    if (!hasCourse || isLoop) return;
    addPoint({ lat: currentMarkers[0].lat, lng: currentMarkers[0].lng });
  };

  // 지금까지 그린 길을 그대로 되짚어 출발점으로 돌아옵니다. 길찾기 요청은 필요 없습니다.
  const handleOutAndBack = () => {
    if (!hasCourse || routeRequestRef.current || savingRef.current) return;
    setRouteError(null);
    pushState({
      markers: [...currentMarkers, ...currentMarkers.slice(0, -1).reverse()],
      polylines: [...currentPolylines, ...currentPolylines.slice().reverse().map(segment => segment.slice().reverse())],
    });
    toast('왕복 코스를 만들었어요.', { tone: 'success' });
  };

  // --- 종목 · 설정 ---
  const handleChangeSport = async (nextSport) => {
    if (nextSport === sport || routeRequestRef.current || savingRef.current) return;
    if (hasMarkers) {
      const ok = await confirm({
        title: `${SPORTS[nextSport].label} 코스로 바꿀까요?`,
        message: `이미 그린 길은 그대로 두고, 다음에 찍는 점부터 ${SPORTS[nextSport].label} 길찾기를 사용해요.`,
        confirmLabel: '바꾸기',
      });
      if (!ok) return;
    }
    setRouteError(null);
    setSport(nextSport);
    writeStored('trazo:sport', nextSport);
  };

  const handlePickSport = (nextSport) => {
    setSport(nextSport);
    writeStored('trazo:sport', nextSport);
    setSavedState(prev => ({ ...prev, sport: nextSport }));
    setHasPickedSport(true);
    setIsSportPickerOpen(false);
  };

  const handleToggleRouteOption = (optionId) => {
    setRouteOptionsBySport(prev => {
      const next = { ...prev, [sport]: { ...prev[sport], [optionId]: !prev[sport][optionId] } };
      writeStored('trazo:routeOptions', next);
      return next;
    });
  };

  const handleChangeSpeed = (speedKmh) => {
    setSpeedBySport(prev => {
      const next = { ...prev, [sport]: speedKmh };
      writeStored('trazo:speedKmh', next);
      return next;
    });
  };

  const handleToggleElevation = () => {
    setIsElevationOpen(open => {
      writeStored('trazo:elevationOpen', !open);
      return !open;
    });
  };

  // --- 계정 ---
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      setIsLibraryOpen(false);
      setIsNicknameEditOpen(false);
      setShareTarget(null);
      setCurrentId(null);
      setCurrentMeta(null);
      // 닉네임이 없으면(처음 로그인) 닉네임 입력 창이 열립니다.
      setNickname(undefined);
      if (nextUser) loadNickname();
    }, (error) => { toast(authErrorMessage(error), { tone: 'error' }); setAuthLoading(false); });
  }, [toast, setNickname, loadNickname]);

  const runAuth = async (action) => {
    if (!auth || authBusy || savingRef.current) return false;
    setAuthBusy(true);
    try { await action(); return true; }
    catch (error) { toast(authErrorMessage(error), { tone: 'error' }); return false; }
    finally { setAuthBusy(false); }
  };
  const handleLogin = () => runAuth(loginWithGoogle);
  const handleLogout = async () => {
    if (await runAuth(logout)) toast('로그아웃했어요.');
  };

  const requireLogin = async (reason) => {
    if (user) return true;
    if (!auth) {
      toast('구글 로그인이 아직 설정되지 않았어요. 관리자에게 문의해주세요.', { tone: 'error' });
      return false;
    }
    const ok = await confirm({ title: '로그인이 필요해요', message: reason, confirmLabel: '구글로 로그인' });
    return ok && handleLogin();
  };

  // 담기·좋아요·댓글처럼 다른 사람에게 닉네임이 보이는 기능은 로그인하고 닉네임을 정한 뒤에 사용합니다.
  const ensureMember = async (reason) => {
    if (!(await requireLogin(reason))) return false;
    const current = nicknameRef.current ?? await loadNickname();
    if (current) return true;
    if (current === null) toast('닉네임을 정하면 바로 이용할 수 있어요.');
    else toast('계정 정보를 확인하지 못했어요. 잠시 후 다시 시도하세요.', { tone: 'error' });
    return false;
  };

  const handleNicknameSaved = (next) => {
    const isFirst = !nicknameRef.current;
    setNickname(next);
    setIsNicknameEditOpen(false);
    toast(isFirst ? `${next}님, 환영해요!` : '닉네임을 바꿨어요.', { tone: 'success' });
  };

  const handleOpenCommunity = () => {
    setSheetExpanded(false);
    setIsCommunityOpen(true);
  };

  // --- 저장 · 불러오기 ---
  const handleOpenSave = async () => {
    if (!hasCourse || isBusy) return;
    if (!(await requireLogin('코스를 저장하려면 구글 계정으로 로그인하세요. 저장한 코스는 어느 기기에서든 다시 불러올 수 있어요.'))) return;
    setIsSaveOpen(true);
  };

  const handleSubmitSave = async ({ mode, title: nextTitle, folderId, visibility }) => {
    if (savingRef.current || routeRequestRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const snapshot = { course: JSON.stringify(currentState), sport, title: nextTitle };
    const course = { title: nextTitle, markers: currentMarkers, polylines: currentPolylines, sport, visibility, folder_id: folderId };
    try {
      const response = mode === 'update' && currentId ? await updateCourse(currentId, course) : await saveCourse(course);
      if (response.data.status !== 'success') throw new Error('save failed');
      const saved = response.data.course;
      setCurrentId(saved.id);
      setCurrentMeta({ folderId: saved.folder_id ?? null, visibility: visibilityOf(saved) });
      writeStored('trazo:lastFolder', saved.folder_id ?? null);
      setTitle(nextTitle);
      setSavedState(snapshot);
      setIsSaveOpen(false);
      toast(mode === 'update' ? '코스를 업데이트했어요.' : '내 코스에 저장했어요.', { tone: 'success' });
      // 공유하는 코스면 바로 링크를 복사할 수 있게 공유 설정을 보여줍니다.
      if (visibilityOf(saved) !== 'private') setShareTarget(saved);
    } catch (error) {
      toast(apiErrorMessage(error, '저장하지 못했어요. 로그인 상태와 인터넷 연결을 확인하세요.'), { tone: 'error' });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleOpenLibrary = async () => {
    if (!(await requireLogin('저장한 코스를 보려면 구글 계정으로 로그인하세요.'))) return;
    setIsLibraryOpen(true);
  };

  // 불러왔으면 true를 돌려줍니다.
  const handleLoadCourse = async (course) => {
    if (savingRef.current) return false;
    if (isModified && hasMarkers && course.id !== currentId) {
      const ok = await confirm({
        title: '저장하지 않은 코스가 있어요',
        message: `'${course.title}'을(를) 불러오면 지금 만든 코스의 변경 사항이 사라져요.`,
        confirmLabel: '불러오기',
        tone: 'danger',
      });
      if (!ok) return false;
    }
    try {
      const loadedMarkers = JSON.parse(course.markers_json);
      const loadedPolylines = JSON.parse(course.polylines_json);
      const loadedSport = isSport(course.sport) ? course.sport : 'bike';
      cancelRoute();
      reset({ markers: loadedMarkers, polylines: loadedPolylines });
      setIsLibraryOpen(false);
      setSport(loadedSport);
      writeStored('trazo:sport', loadedSport);
      setHasPickedSport(true);
      setIsSportPickerOpen(false);
      setTitle(course.title);
      setCurrentId(course.id);
      setCurrentMeta({ folderId: course.folder_id ?? null, visibility: visibilityOf(course) });
      setSavedState({ course: JSON.stringify({ markers: loadedMarkers, polylines: loadedPolylines }), sport: loadedSport, title: course.title });
      const points = flattenCourse(loadedPolylines);
      fitToPoints(points.length ? points : loadedMarkers);
      toast(`'${course.title}'을(를) 불러왔어요.`, { tone: 'success' });
      return true;
    } catch {
      toast('코스 데이터를 읽지 못했어요.', { tone: 'error' });
      return false;
    }
  };

  // 공유받아 내 코스에 담은 코스를 지도에서 열면 커뮤니티·공유 코스 창을 닫습니다.
  const handleOpenCopiedCourse = async (course) => {
    if (!(await handleLoadCourse(course))) return;
    setSharedToken(null);
    setIsCommunityOpen(false);
  };

  // 내 코스나 공유 설정에서 이름·폴더·공개 범위를 바꾼 코스가 지금 편집 중인 코스면 함께 반영합니다.
  const handleCourseUpdated = (course) => {
    if (course.id !== currentId) return;
    setCurrentMeta({ folderId: course.folder_id ?? null, visibility: visibilityOf(course) });
    if (course.title !== savedState.title) {
      setTitle(course.title);
      setSavedState(prev => ({ ...prev, title: course.title }));
    }
  };

  const handleCourseDeleted = (id) => {
    if (id !== currentId) return;
    // 지도에 남은 코스는 저장되지 않은 새 코스가 됩니다.
    setCurrentId(null);
    setCurrentMeta(null);
    setSavedState({ course: JSON.stringify(EMPTY_COURSE), sport, title: null });
  };

  // --- 내보내기 ---
  const handleDownloadGpx = () => {
    if (!currentPolylines.length) return;
    const gpx = buildGpx(currentPolylines, { name: displayTitle, type: currentSport.gpxType });
    downloadBlob(new Blob([gpx], { type: 'application/gpx+xml' }), `${safeFileName(displayTitle)}.gpx`);
    toast('GPX 파일을 내려받았어요.', { tone: 'success' });
  };

  const handleDownloadTcx = async () => {
    if (!currentPolylines.length || isExportingTcx) return;
    setIsExportingTcx(true);
    try {
      const response = await downloadTCX(flattenCourse(currentPolylines), { name: displayTitle, speedKmh: speedBySport[sport] });
      downloadBlob(new Blob([response.data]), `${safeFileName(displayTitle)}.tcx`);
      toast('TCX 파일을 내려받았어요.', { tone: 'success' });
    } catch {
      toast('TCX 파일을 만들지 못했어요. 잠시 후 다시 시도하세요.', { tone: 'error' });
    } finally {
      setIsExportingTcx(false);
    }
  };

  const handleNewCourse = async () => {
    if (savingRef.current) return;
    if (isModified && hasMarkers) {
      const ok = await confirm({
        title: '새 코스를 시작할까요?',
        message: '저장하지 않은 지금 코스는 사라져요.',
        confirmLabel: '새로 시작',
        tone: 'danger',
      });
      if (!ok) return;
    }
    cancelRoute();
    reset(EMPTY_COURSE);
    hoverMarkerRef.current?.setVisible(false);
    setTitle(null);
    setCurrentId(null);
    setCurrentMeta(null);
    setSavedState({ course: JSON.stringify(EMPTY_COURSE), sport, title: null });
    setSheetExpanded(false);
    // 새 코스는 종목부터 고릅니다.
    setIsSportPickerOpen(true);
  };

  const handleRename = (nextTitle) => setTitle(nextTitle);

  // --- 지도 도구 ---
  const handleLocate = () => {
    if (!navigator.geolocation) {
      toast('이 브라우저에서는 위치 확인을 지원하지 않아요.', { tone: 'error' });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMyLocation(point);
        map?.setLevel(Math.min(map.getLevel(), 4));
        map?.panTo(new window.kakao.maps.LatLng(point.lat, point.lng));
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        toast(error.code === error.PERMISSION_DENIED
          ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치 접근을 허용해주세요.'
          : '현재 위치를 확인하지 못했어요.', { tone: 'error' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleFit = () => {
    const points = flattenCourse(currentPolylines);
    fitToPoints(points.length ? points : currentMarkers);
  };

  const updateHoverMarker = useCallback((coord) => {
    const marker = hoverMarkerRef.current;
    if (!marker) return;
    if (coord) {
      marker.setPosition(new window.kakao.maps.LatLng(coord.lat, coord.lng));
      marker.setVisible(true);
    } else {
      marker.setVisible(false);
    }
  }, []);

  // 지도 이벤트 처리기는 한 번만 등록하므로, 최신 코스와 편집 함수는 ref로 넘겨줍니다.
  useEffect(() => {
    editRef.current = {
      markers: currentMarkers,
      trackIndex,
      isLoop,
      enabled: !isSportPickerOpen && !isBusy,
      moveMarker,
      insertPoint,
    };
  });

  // 데스크톱: 코스 근처에 마우스를 올리면 가장 가까운 코스 위치에 점이 달라붙고 고도 차트에도 표시합니다.
  //           점이나 길을 잡고 끌면 코스를 고칩니다.
  // 모바일:   점이나 길을 꾹 누르면 잡히고, 그대로 끌어 코스를 고칩니다.
  useEffect(() => {
    const node = mapAreaRef.current;
    if (!map || !node) return;
    const { kakao } = window;
    let gesture = null;
    let hoverFrame = 0;
    let dragFrame = 0;
    let lastHoverEvent = null;
    let hoverShown = false;

    const localPoint = (event) => {
      const rect = node.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const toLatLng = ({ x, y }) => {
      const coords = map.getProjection().coordsFromContainerPoint(new kakao.maps.Point(x, y));
      return { lat: coords.getLat(), lng: coords.getLng() };
    };
    const metersPerPixel = () => (distanceKm(toLatLng({ x: 0, y: 0 }), toLatLng({ x: 0, y: 100 })) * 1000) / 100;

    // 화면에서 pos 가까이에 잡을 수 있는 점이나 길이 있는지 찾습니다. 점을 길보다 먼저 잡습니다.
    const hitTest = (pos, pointerType) => {
      const { markers, trackIndex: index } = editRef.current;
      const radius = GRAB_PX[pointerType === 'mouse' ? 'mouse' : 'touch'];
      const projection = map.getProjection();
      let best = null;
      markers.forEach((marker, i) => {
        const p = projection.containerPointFromCoords(new kakao.maps.LatLng(marker.lat, marker.lng));
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d <= radius && (!best || d <= best.d)) best = { d, index: i };
      });
      if (best) return { type: 'marker', index: best.index, origin: markers[best.index] };
      const near = nearestOnTrack(index, toLatLng(pos), radius * metersPerPixel());
      return near ? { type: 'line', segmentIndex: near.segmentIndex, origin: near } : null;
    };

    const anchorsFor = (hit) => {
      const { markers, isLoop: loop } = editRef.current;
      if (hit.type === 'line') return [markers[hit.segmentIndex], markers[hit.segmentIndex + 1]];
      const { prev, next } = markerNeighbors(markers, hit.index, loop);
      return [prev != null ? markers[prev] : null, next != null ? markers[next] : null].filter(Boolean);
    };

    const showHover = (near) => {
      updateHoverMarker(near);
      hoverBus.emit(near ? near.km : null);
      hoverShown = Boolean(near);
    };
    const clearHover = () => {
      if (hoverShown) showHover(null);
      node.classList.remove('is-grabbable');
    };

    const runHover = () => {
      hoverFrame = 0;
      const event = lastHoverEvent;
      if (gesture || !event?.target.closest?.('.map-canvas')) { clearHover(); return; }
      const { trackIndex: index, enabled } = editRef.current;
      const pos = localPoint(event);
      const near = index ? nearestOnTrack(index, toLatLng(pos), HOVER_PX * metersPerPixel()) : null;
      if (near || hoverShown) showHover(near);
      node.classList.toggle('is-grabbable', enabled && Boolean(hitTest(pos, 'mouse')));
    };

    const renderDrag = () => {
      dragFrame = 0;
      if (gesture?.dragging) setDragPreview({ point: gesture.point, anchors: gesture.anchors });
    };

    const beginDrag = () => {
      gesture.dragging = true;
      gesture.point = gesture.hit.origin;
      gesture.anchors = anchorsFor(gesture.hit);
      map.setDraggable(false);
      clearHover();
      node.classList.add('is-dragging');
      renderDrag();
    };

    const finish = (commit) => {
      const done = gesture;
      gesture = null;
      if (!done) return;
      clearTimeout(done.timer);
      map.setDraggable(true);
      node.classList.remove('is-dragging');
      if (!done.dragging) return;
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      setDragPreview(null);
      suppressClickUntilRef.current = Date.now() + 500;
      if (!commit) return;
      const point = { lat: done.point.lat, lng: done.point.lng };
      if (done.hit.type === 'marker') editRef.current.moveMarker(done.hit.index, point);
      else editRef.current.insertPoint(done.hit.segmentIndex, point);
    };

    const onPointerDown = (event) => {
      // 두 번째 손가락이 닿으면(확대·축소) 잡기를 그만둡니다.
      if (gesture) { finish(false); return; }
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (!editRef.current.enabled || !event.target.closest('.map-canvas')) return;
      const hit = hitTest(localPoint(event), event.pointerType);
      if (!hit) return;
      gesture = { pointerId: event.pointerId, pointerType: event.pointerType, hit, startX: event.clientX, startY: event.clientY, dragging: false, timer: 0 };
      if (event.pointerType === 'mouse') {
        // 지도가 함께 끌려가지 않게 합니다. 끌지 않고 떼면 평소처럼 지도 클릭으로 점이 찍힙니다.
        map.setDraggable(false);
      } else {
        gesture.timer = setTimeout(() => {
          if (!gesture || gesture.dragging) return;
          navigator.vibrate?.(15);
          beginDrag();
        }, LONG_PRESS_MS);
      }
    };

    const onPointerMove = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (!gesture.dragging) {
        const moved = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        // 터치는 꾹 누르기 전에 움직이면 지도를 움직이려는 것으로 봅니다.
        if (gesture.pointerType !== 'mouse') { if (moved > 10) finish(false); return; }
        if (moved <= 4) return;
        beginDrag();
      }
      gesture.point = toLatLng(localPoint(event));
      if (!dragFrame) dragFrame = requestAnimationFrame(renderDrag);
    };

    const onPointerUp = (event) => {
      if (gesture && event.pointerId === gesture.pointerId) finish(event.type === 'pointerup');
    };

    const onHoverMove = (event) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
      lastHoverEvent = event;
      if (!hoverFrame) hoverFrame = requestAnimationFrame(runHover);
    };

    const onPointerLeave = (event) => {
      if (event.pointerType !== 'mouse' || gesture) return;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      clearHover();
    };

    // 끄는 동안에는 카카오 지도가 터치 움직임을 받지 않게 해 지도가 따라 움직이지 않습니다.
    const onTouchMove = (event) => {
      if (!gesture?.dragging) return;
      event.preventDefault();
      event.stopPropagation();
    };
    // 지도 위에서는 브라우저 기본 메뉴 대신 지도 우클릭 메뉴를 씁니다.
    const onContextMenu = (event) => { if (gesture || event.target.closest?.('.map-canvas')) event.preventDefault(); };
    const onKeyDown = (event) => { if (event.key === 'Escape') finish(false); };

    node.addEventListener('pointerdown', onPointerDown, true);
    node.addEventListener('pointermove', onHoverMove);
    node.addEventListener('pointerleave', onPointerLeave);
    node.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    node.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      finish(false);
      cancelAnimationFrame(hoverFrame);
      node.removeEventListener('pointerdown', onPointerDown, true);
      node.removeEventListener('pointermove', onHoverMove);
      node.removeEventListener('pointerleave', onPointerLeave);
      node.removeEventListener('touchmove', onTouchMove, { capture: true });
      node.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [map, isMobile, hoverBus, updateHoverMarker]);

  // --- 화면 조각 ---
  const summary = (
    <CourseSummary
      sport={sport}
      title={displayTitle}
      onRename={handleRename}
      isModified={isModified}
      isSavedCourse={Boolean(currentId)}
      stats={stats}
      speedKmh={speedBySport[sport]}
      hasCourse={hasCourse}
      onSave={handleOpenSave}
      canSave={hasCourse && !isBusy && !authBusy}
      isSaving={isSaving}
      onDownloadGpx={handleDownloadGpx}
      onDownloadTcx={handleDownloadTcx}
      isExportingTcx={isExportingTcx}
    />
  );

  const settings = (
    <CourseSettings
      sport={sport}
      markerCount={currentMarkers.length}
      isLoop={isLoop}
      isBusy={isBusy}
      onCloseLoop={handleCloseLoop}
      onOutAndBack={handleOutAndBack}
      onNewCourse={handleNewCourse}
      isAutoRouting={isAutoRouting}
      onToggleAutoRouting={setIsAutoRouting}
      routeOptions={routeOptionsBySport[sport]}
      onToggleRouteOption={handleToggleRouteOption}
      onOpenHelp={() => setIsHelpOpen(true)}
      speedKmh={speedBySport[sport]}
      onChangeSpeed={handleChangeSpeed}
    />
  );

  const sportSwitch = (size) => (
    <SegmentedControl
      label="코스 종목"
      options={SPORT_OPTIONS}
      value={sport}
      onChange={handleChangeSport}
      disabled={isBusy}
      size={size}
    />
  );

  const account = (
    <AccountButton
      user={user}
      nickname={nickname}
      configured={Boolean(auth)}
      loading={authLoading}
      busy={authBusy}
      onLogin={handleLogin}
      onLogout={handleLogout}
      onOpenLibrary={handleOpenLibrary}
      onOpenCommunity={handleOpenCommunity}
      onEditNickname={() => setIsNicknameEditOpen(true)}
      compact
    />
  );

  const mapArea = (
    <div className="map-area" ref={mapAreaRef}>
      <Map
        center={INITIAL_VIEW.center}
        level={INITIAL_VIEW.level}
        className="map-canvas"
        style={{ width: '100%', height: '100%' }}
        onClick={handleMapClick}
        onCreate={setMap}
        onIdle={handleMapIdle}
        onRightClick={handleMapRightClick}
        onDragStart={closeMapMenu}
        onZoomStart={closeMapMenu}
      >
        {currentPolylines.map((path, idx) => (
          // 밝은 종목 색이 지도 위에서도 잘 보이도록 짙은 테두리 선을 먼저 그립니다.
          <Polyline key={`o-${idx}`} path={path} strokeWeight={9} strokeColor={COLORS.primary} strokeOpacity={0.45} strokeStyle="solid" />
        ))}
        {currentPolylines.map((path, idx) => (
          <Polyline key={`l-${idx}`} path={path} strokeWeight={5} strokeColor={currentSport.color} strokeOpacity={0.95} strokeStyle="solid" />
        ))}
        {kmMarkers.map(marker => (
          <CustomOverlayMap key={`km-${marker.km}`} position={marker} zIndex={3}>
            <div className="km-badge">{marker.km}km</div>
          </CustomOverlayMap>
        ))}
        {currentMarkers.map((pos, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === currentMarkers.length - 1 && idx > 0;
          const image = isStart ? icons.start : isEnd ? icons.end : icons.waypoint;
          return <MapMarker key={`m-${idx}`} position={pos} zIndex={isStart ? 6 : isEnd ? 5 : 4} image={image} />;
        })}
        {dragPreview && dragPreview.anchors.map((anchor, idx) => (
          <Polyline key={`drag-${idx}`} path={[anchor, dragPreview.point]} strokeWeight={4} strokeColor={COLORS.primary} strokeOpacity={0.9} strokeStyle="shortdash" />
        ))}
        {dragPreview && (
          <CustomOverlayMap position={dragPreview.point} zIndex={10}>
            <div className="drag-handle" aria-hidden="true" />
          </CustomOverlayMap>
        )}
        {myLocation && (
          <CustomOverlayMap position={myLocation} zIndex={2}>
            <div className="my-location" aria-label="내 위치" />
          </CustomOverlayMap>
        )}
      </Map>

      {!isSportPickerOpen && !isRouting && !routeError && <MapHint sport={sport} markerCount={currentMarkers.length} />}
      <MapContextMenu menu={mapMenu} onClose={closeMapMenu} />
      <RouteStatus
        sport={sport}
        isRouting={isRouting}
        error={routeError}
        onCancel={cancelRoute}
        onRetry={() => addPoint(routeError.point, routeError.mode)}
        onStraight={() => addPoint(routeError.point, 'straight')}
        onDismiss={() => setRouteError(null)}
      />
      <MapControls
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo && !isBusy}
        canRedo={canRedo && !isBusy}
        onLocate={handleLocate}
        isLocating={isLocating}
        onFit={handleFit}
        canFit={hasMarkers}
        isSatellite={isSatellite}
        onToggleSatellite={handleToggleSatellite}
      />
    </div>
  );

  const hasPolylines = currentPolylines.length > 0;
  const rootStyle = { '--sport': currentSport.color, '--on-sport': currentSport.onColor, '--sheet-peek': `${sheetPeek}px` };

  return (
    <>
      {isMobile ? (
        <div className="app app--mobile" style={rootStyle}>
          <main className="workspace">{mapArea}</main>
          <header className="topbar">
            <Brand compact />
            {sportSwitch()}
            {account}
          </header>
          <BottomSheet
            label="코스 정보"
            peek={summary}
            expanded={sheetExpanded}
            onExpandedChange={setSheetExpanded}
            onPeekHeightChange={setSheetPeek}
          >
            {hasPolylines && (
              <ElevationPanel variant="inline" polylines={currentPolylines} zones={currentSport.gradeZones} onHoverPoint={updateHoverMarker} hoverSource={hoverBus} />
            )}
            {settings}
            <div className="tool-grid tool-grid--3">
              <Button variant="secondary" icon="folder" onClick={handleOpenLibrary}>내 코스</Button>
              <Button variant="secondary" icon="users" onClick={handleOpenCommunity}>커뮤니티</Button>
              <Button variant="ghost" icon="help" onClick={() => setIsHelpOpen(true)}>도움말</Button>
            </div>
          </BottomSheet>
        </div>
      ) : (
        <div className="app" style={rootStyle}>
          <aside className="sidebar">
            <header className="sidebar__header">
              <Brand />
              <Button variant="ghost" icon="users" iconSize={20} onClick={handleOpenCommunity} aria-label="커뮤니티" title="커뮤니티" />
              {user && <Button variant="ghost" icon="folder" iconSize={20} onClick={handleOpenLibrary} aria-label="내 코스" title="내 코스" />}
              {account}
            </header>
            <div className="sidebar__body">
              {sportSwitch('lg')}
              {summary}
              {settings}
            </div>
            <footer className="sidebar__footer">
              <span>지도 데이터 © OpenStreetMap 기여자</span>
              <button type="button" className="link-btn" onClick={() => setIsHelpOpen(true)}>사용법</button>
            </footer>
          </aside>
          <main className="workspace">
            {mapArea}
            {hasPolylines && (
              <ElevationPanel
                variant="dock"
                open={isElevationOpen}
                onToggle={handleToggleElevation}
                polylines={currentPolylines}
                zones={currentSport.gradeZones}
                onHoverPoint={updateHoverMarker}
                hoverSource={hoverBus}
              />
            )}
          </main>
        </div>
      )}

      {isLibraryOpen && (
        <CourseLibrary
          key={user?.uid}
          onClose={() => setIsLibraryOpen(false)}
          currentId={currentId}
          onLoad={handleLoadCourse}
          onUpdated={handleCourseUpdated}
          onDeleted={handleCourseDeleted}
        />
      )}
      {isSaveOpen && (
        <SaveCourseDialog
          open
          onClose={() => setIsSaveOpen(false)}
          defaultTitle={displayTitle}
          existingTitle={currentId ? savedState.title ?? displayTitle : null}
          defaultFolderId={currentMeta ? currentMeta.folderId : readStored('trazo:lastFolder', null)}
          defaultVisibility={currentMeta?.visibility ?? 'private'}
          onSubmit={handleSubmitSave}
          isSaving={isSaving}
        />
      )}
      {shareTarget && (
        <ShareDialog
          course={shareTarget}
          onUpdated={(course) => { setShareTarget(course); handleCourseUpdated(course); }}
          onClose={() => setShareTarget(null)}
        />
      )}
      {isCommunityOpen && (
        <CommunityDialog
          userId={user?.uid ?? null}
          ensureMember={ensureMember}
          onOpenCourse={handleOpenCopiedCourse}
          onClose={() => setIsCommunityOpen(false)}
        />
      )}
      {sharedToken && (
        <SharedCourseDialog
          token={sharedToken}
          userId={user?.uid ?? null}
          ensureMember={ensureMember}
          onOpenCourse={handleOpenCopiedCourse}
          onClose={() => {
            setSharedToken(null);
            if (!hasPickedSport) setIsSportPickerOpen(true);
          }}
        />
      )}
      {user && (nickname === null || (isNicknameEditOpen && nickname)) && (
        <NicknameDialog
          key={nickname ?? 'new'}
          initial={nickname}
          required={nickname === null}
          onSaved={handleNicknameSaved}
          onClose={() => setIsNicknameEditOpen(false)}
          onLogout={handleLogout}
        />
      )}
      <RoutingHelpDialog open={isHelpOpen} onClose={() => setIsHelpOpen(false)} sport={sport} />
      <SportPicker
        open={isSportPickerOpen}
        onSelect={handlePickSport}
        onClose={() => setIsSportPickerOpen(false)}
        isFirstVisit={!hasPickedSport}
      />
    </>
  );
}

export default App;
