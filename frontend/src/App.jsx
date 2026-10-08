// src/App.jsx
// 화면 구성: 데스크톱은 왼쪽 사이드바 + 지도 + 아래 고도 패널, 모바일은 전체 화면 지도 + 위쪽 바 + 아래 시트입니다.
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Map, MapMarker, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';
import { onAuthStateChanged } from 'firebase/auth';

import { markerIcons, HOVER_MARKER_ICON } from './constants';
import { useHistoryState } from './hooks/useHistoryState';
import { useIsMobile } from './hooks/useMediaQuery';
import { fetchRoutePath, saveCourse, downloadTCX, updateCourse } from './api/courseApi';
import { auth, loginWithGoogle, logout, authErrorMessage } from './firebase';
import { SPORTS, SPORT_IDS, isSport, defaultRouteOptions } from './sports';
import { buildGpx, courseStats, distanceMarkers, flattenCourse, safeFileName } from './utils/course';
import { readStored, writeStored } from './utils/storage';
import { COLORS } from './styles/theme';

import AccountButton from './components/AccountButton';
import BottomSheet from './components/BottomSheet';
import { CourseSummary, CourseSettings } from './components/CoursePanel';
import CourseLibrary from './components/CourseLibrary';
import ElevationPanel from './components/ElevationPanel';
import { MapControls, MapHint, RouteStatus } from './components/MapOverlays';
import RoutingHelpDialog from './components/RoutingHelpDialog';
import SaveCourseDialog from './components/SaveCourseDialog';
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

  // --- 지도 ---
  const [map, setMap] = useState(null);
  const mapAreaRef = useRef(null);
  const hoverMarkerRef = useRef(null);
  const [myLocation, setMyLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // --- 종목과 길찾기 설정 ---
  const [sport, setSport] = useState(isSport(storedSport) ? storedSport : 'bike');
  // 처음 방문하면 종목부터 고르게 합니다. 한 번 고른 뒤에는 종목 선택 화면을 닫을 수 있습니다.
  const [hasPickedSport, setHasPickedSport] = useState(isSport(storedSport));
  const [isSportPickerOpen, setIsSportPickerOpen] = useState(!isSport(storedSport));
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

  // 자전거 코스에서만 카카오 자전거 지도(자전거도로 표시)를 겹쳐 보여줍니다.
  const bicycleOverlayRef = useRef(false);
  useEffect(() => {
    if (!map || bicycleOverlayRef.current === currentSport.showBicycleOverlay) return;
    const bicycle = window.kakao.maps.MapTypeId.BICYCLE;
    if (currentSport.showBicycleOverlay) map.addOverlayMapTypeId(bicycle);
    else map.removeOverlayMapTypeId(bicycle);
    bicycleOverlayRef.current = currentSport.showBicycleOverlay;
  }, [map, currentSport.showBicycleOverlay]);

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

  const addPoint = async (newPoint, mode = isAutoRouting ? 'turn-by-turn' : 'straight') => {
    if (routeRequestRef.current || savingRef.current) return;
    setRouteError(null);
    if (!currentMarkers.length) {
      pushState({ markers: [newPoint], polylines: [] });
      return;
    }
    const controller = new AbortController();
    routeRequestRef.current = controller;
    setIsRouting(true);
    try {
      const segment = await fetchRoutePath(currentMarkers.at(-1), newPoint, { mode, sport, options: enabledRouteOptions }, controller.signal);
      if (routeRequestRef.current !== controller || controller.signal.aborted) return;
      // 점 표시를 실제 길 위(경로의 시작·끝)로 옮겨, 찍은 점이 어느 길에 붙었는지 바로 보이게 합니다.
      // 출발점으로 복귀할 때는 순환 코스로 인식되도록 출발점 좌표를 그대로 씁니다.
      const onRoad = (point) => ({ lat: point.lat, lng: point.lng });
      const closesLoop = newPoint.lat === currentMarkers[0].lat && newPoint.lng === currentMarkers[0].lng;
      const markers = currentMarkers.length === 1 ? [onRoad(segment[0])] : [...currentMarkers];
      markers.push(closesLoop ? markers[0] : onRoad(segment.at(-1)));
      pushState({ markers, polylines: [...currentPolylines, segment] });
    } catch {
      if (routeRequestRef.current === controller && !controller.signal.aborted) {
        setRouteError({
          point: newPoint,
          mode,
          message: mode === 'straight'
            ? '고도 정보를 가져오지 못했어요. 인터넷 연결을 확인하고 다시 시도하세요.'
            : `${currentSport.label} 길을 찾지 못했어요. 다시 시도하거나 직선으로 이어보세요.`,
        });
      }
    } finally {
      if (routeRequestRef.current === controller) {
        routeRequestRef.current = null;
        setIsRouting(false);
      }
    }
  };

  const handleMapClick = (_target, event) => {
    if (isSportPickerOpen) return;
    // 모바일에서 시트를 펼친 상태로 지도를 누르면 먼저 시트만 접습니다.
    if (isMobile && sheetExpanded) { setSheetExpanded(false); return; }
    addPoint({ lat: event.latLng.getLat(), lng: event.latLng.getLng() });
  };

  const handleMapIdle = (target) => {
    const center = target.getCenter();
    writeStored('trazo:view', { lat: center.getLat(), lng: center.getLng(), level: target.getLevel() });
  };

  const first = currentMarkers[0];
  const last = currentMarkers.at(-1);
  const isLoop = hasCourse && first.lat === last.lat && first.lng === last.lng;

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
      setCurrentId(null);
    }, (error) => { toast(authErrorMessage(error), { tone: 'error' }); setAuthLoading(false); });
  }, [toast]);

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

  // --- 저장 · 불러오기 ---
  const handleOpenSave = async () => {
    if (!hasCourse || isBusy) return;
    if (!(await requireLogin('코스를 저장하려면 구글 계정으로 로그인하세요. 저장한 코스는 어느 기기에서든 다시 불러올 수 있어요.'))) return;
    setIsSaveOpen(true);
  };

  const handleSubmitSave = async ({ mode, title: nextTitle }) => {
    if (savingRef.current || routeRequestRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const snapshot = { course: JSON.stringify(currentState), sport, title: nextTitle };
    try {
      if (mode === 'update' && currentId) {
        await updateCourse(currentId, nextTitle, currentMarkers, currentPolylines, sport);
      } else {
        const response = await saveCourse(nextTitle, currentMarkers, currentPolylines, sport);
        if (response.data.status !== 'success') throw new Error('save failed');
        setCurrentId(response.data.course_id);
      }
      setTitle(nextTitle);
      setSavedState(snapshot);
      setIsSaveOpen(false);
      toast(mode === 'update' ? '코스를 업데이트했어요.' : '내 코스에 저장했어요.', { tone: 'success' });
    } catch {
      toast('저장하지 못했어요. 로그인 상태와 인터넷 연결을 확인하세요.', { tone: 'error' });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleOpenLibrary = async () => {
    if (!(await requireLogin('저장한 코스를 보려면 구글 계정으로 로그인하세요.'))) return;
    setIsLibraryOpen(true);
  };

  const handleLoadCourse = async (course) => {
    if (savingRef.current) return;
    if (isModified && course.id !== currentId) {
      const ok = await confirm({
        title: '저장하지 않은 코스가 있어요',
        message: `'${course.title}'을(를) 불러오면 지금 만든 코스의 변경 사항이 사라져요.`,
        confirmLabel: '불러오기',
        tone: 'danger',
      });
      if (!ok) return;
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
      setTitle(course.title);
      setCurrentId(course.id);
      setSavedState({ course: JSON.stringify({ markers: loadedMarkers, polylines: loadedPolylines }), sport: loadedSport, title: course.title });
      const points = flattenCourse(loadedPolylines);
      fitToPoints(points.length ? points : loadedMarkers);
      toast(`'${course.title}'을(를) 불러왔어요.`, { tone: 'success' });
    } catch {
      toast('코스 데이터를 읽지 못했어요.', { tone: 'error' });
    }
  };

  const handleCourseRenamed = (id, nextTitle) => {
    if (id !== currentId) return;
    setTitle(nextTitle);
    setSavedState(prev => ({ ...prev, title: nextTitle }));
  };

  const handleCourseDeleted = (id) => {
    if (id !== currentId) return;
    // 지도에 남은 코스는 저장되지 않은 새 코스가 됩니다.
    setCurrentId(null);
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
      configured={Boolean(auth)}
      loading={authLoading}
      busy={authBusy}
      onLogin={handleLogin}
      onLogout={handleLogout}
      onOpenLibrary={handleOpenLibrary}
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
        {myLocation && (
          <CustomOverlayMap position={myLocation} zIndex={2}>
            <div className="my-location" aria-label="내 위치" />
          </CustomOverlayMap>
        )}
      </Map>

      {!isSportPickerOpen && !isRouting && !routeError && <MapHint sport={sport} markerCount={currentMarkers.length} />}
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
              <ElevationPanel variant="inline" polylines={currentPolylines} zones={currentSport.gradeZones} onHoverPoint={updateHoverMarker} />
            )}
            {settings}
            <div className="tool-grid">
              <Button variant="secondary" icon="folder" onClick={handleOpenLibrary}>내 코스</Button>
              <Button variant="ghost" icon="help" onClick={() => setIsHelpOpen(true)}>도움말</Button>
            </div>
          </BottomSheet>
        </div>
      ) : (
        <div className="app" style={rootStyle}>
          <aside className="sidebar">
            <header className="sidebar__header">
              <Brand />
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
          onRenamed={handleCourseRenamed}
          onDeleted={handleCourseDeleted}
        />
      )}
      {isSaveOpen && (
        <SaveCourseDialog
          open
          onClose={() => setIsSaveOpen(false)}
          defaultTitle={displayTitle}
          existingTitle={currentId ? savedState.title ?? displayTitle : null}
          onSubmit={handleSubmitSave}
          isSaving={isSaving}
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
