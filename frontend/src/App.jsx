// src/App.jsx
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Map, MapMarker, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';
import ElevationChart from './ElevationChart';

import { ICONS } from './constants';
import { useHistoryState } from './hooks/useHistoryState';
import { fetchRoutePath, saveCourse, getCourseList, downloadTCX, updateCourse } from './api/courseApi';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle, logout, authErrorMessage } from './firebase';
import ControlPanel from './components/ControlPanel';
import LoadCourseModal from './components/LoadCourseModal';
import GradientLegend from './components/GradientLegend';
import SportPicker from './components/SportPicker';
import Button from './components/ui/Button';
import { SPORTS, SPORT_IDS, isSport, defaultRouteOptions } from './sports';
import { buildGpx, courseStats, distanceMarkers, flattenCourse, safeFileName } from './utils/course';

// ⚡ 테마 색상 가져오기
import { COLORS, SHADOWS } from './styles/theme';

// 브라우저 저장소를 쓸 수 없어도(사생활 보호 모드 등) 화면은 동작해야 합니다.
const readStored = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch { return fallback; }
};
const writeStored = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장하지 못해도 무시 */ }
};

const storedSport = readStored('trazo:sport', null);
const initialRouteOptions = () => {
  const stored = readStored('trazo:routeOptions', {});
  return Object.fromEntries(SPORT_IDS.map(id => [id, { ...defaultRouteOptions(id), ...(stored[id] || {}) }]));
};
const initialSpeeds = () => {
  const stored = readStored('trazo:speedKmh', {});
  return Object.fromEntries(SPORT_IDS.map(id => [id, Number.isFinite(stored[id]) ? stored[id] : SPORTS[id].defaultSpeedKmh]));
};

const EMPTY_COURSE = { markers: [], polylines: [] };

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
};

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const accountRef = useRef(null);
  const [center, setCenter] = useState({ lat: 37.521285, lng: 126.999852 });
  const [map, setMap] = useState(null);

  // 종목: 처음 방문하면 종목 선택 화면을 보여줍니다.
  const [sport, setSport] = useState(isSport(storedSport) ? storedSport : 'bike');
  const [isSportPickerOpen, setIsSportPickerOpen] = useState(!isSport(storedSport));
  const [routeOptionsBySport, setRouteOptionsBySport] = useState(initialRouteOptions);
  const [speedBySport, setSpeedBySport] = useState(initialSpeeds);
  const currentSport = SPORTS[sport];

  const routeRequestRef = useRef(null);
  const savingRef = useRef(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const { currentState, pushState, undo, redo, reset, canUndo, canRedo } = useHistoryState(EMPTY_COURSE, () => Boolean(routeRequestRef.current || savingRef.current));
  const { markers: currentMarkers, polylines: currentPolylines } = currentState;

  const [courseList, setCourseList] = useState([]);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isChartOpen, setIsChartOpen] = useState(true);
  const [isAutoRouting, setIsAutoRouting] = useState(true);

  const [currentTitle, setCurrentTitle] = useState("새 코스");
  const [savedState, setSavedState] = useState({ course: JSON.stringify(EMPTY_COURSE), sport });
  const isModified = JSON.stringify(currentState) !== savedState.course || (currentMarkers.length > 0 && sport !== savedState.sport);
  const [currentId, setCurrentId] = useState(null);

  const hoverMarkerRef = useRef(null);

  const stats = useMemo(() => courseStats(currentPolylines), [currentPolylines]);
  const kmMarkers = useMemo(() => distanceMarkers(currentPolylines, currentSport.distanceMarkerKm), [currentPolylines, currentSport.distanceMarkerKm]);

  useEffect(() => {
    if (!map) return;
    const markerImage = new window.kakao.maps.MarkerImage(
      ICONS.HOVER_TARGET,
      new window.kakao.maps.Size(24, 24),
      { offset: new window.kakao.maps.Point(12, 12) }
    );
    const marker = new window.kakao.maps.Marker({ position: map.getCenter(), image: markerImage, zIndex: 100 });
    marker.setMap(map);
    marker.setVisible(false);
    hoverMarkerRef.current = marker;
  }, [map]);

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
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isModified]);

  const cancelRoute = () => {
    routeRequestRef.current?.abort();
    routeRequestRef.current = null;
    setIsRouting(false);
    setRouteError(null);
  };
  useEffect(() => () => routeRequestRef.current?.abort(), []);

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
      pushState({ markers: [...currentMarkers, newPoint], polylines: [...currentPolylines, segment] });
      setIsChartOpen(true);
    } catch {
      if (routeRequestRef.current === controller && !controller.signal.aborted) {
        setRouteError({ point: newPoint, mode, message: `${currentSport.label} 경로를 찾지 못했습니다. 다시 시도하거나 직선 연결을 선택하세요.` });
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
    addPoint({ lat: event.latLng.getLat(), lng: event.latLng.getLng() });
  };

  const first = currentMarkers[0];
  const last = currentMarkers.at(-1);
  const isLoop = currentMarkers.length >= 2 && first.lat === last.lat && first.lng === last.lng;

  // 마지막 점에서 출발점까지 길을 찾아 순환 코스를 만듭니다.
  const handleCloseLoop = () => {
    if (currentMarkers.length < 2 || isLoop) return;
    addPoint({ lat: currentMarkers[0].lat, lng: currentMarkers[0].lng });
  };

  // 지금까지 그린 길을 그대로 되짚어 출발점으로 돌아옵니다. 길찾기 요청은 필요 없습니다.
  const handleOutAndBack = () => {
    if (currentMarkers.length < 2 || routeRequestRef.current || savingRef.current) return;
    setRouteError(null);
    pushState({
      markers: [...currentMarkers, ...currentMarkers.slice(0, -1).reverse()],
      polylines: [...currentPolylines, ...currentPolylines.slice().reverse().map(segment => segment.slice().reverse())],
    });
  };

  const handleChangeSport = (nextSport) => {
    if (nextSport === sport || routeRequestRef.current || savingRef.current) return;
    if (currentMarkers.length > 0 && !window.confirm(
      `이 코스를 ${SPORTS[nextSport].label} 코스로 바꿉니다.\n이미 그린 길은 그대로 두고, 다음에 찍는 점부터 ${SPORTS[nextSport].label} 길찾기를 사용합니다.`
    )) return;
    setRouteError(null);
    setSport(nextSport);
    writeStored('trazo:sport', nextSport);
  };

  const handlePickSport = (nextSport) => {
    setSport(nextSport);
    writeStored('trazo:sport', nextSport);
    setSavedState(prev => ({ ...prev, sport: nextSport }));
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

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      accountRef.current = nextUser?.uid || null;
      setUser(nextUser);
      setAuthLoading(false);
      setCourseList([]);
      setIsLoadModalOpen(false);
      setCurrentId(null);
    }, (error) => { setAuthError(authErrorMessage(error)); setAuthLoading(false); });
  }, []);

  const handleAuth = async () => {
    if (!auth || authBusy || savingRef.current) return;
    setAuthBusy(true);
    setAuthError('');
    try { if (user) await logout(); else await loginWithGoogle(); }
    catch (error) { setAuthError(authErrorMessage(error)); }
    finally { setAuthBusy(false); }
  };

  const handleSave = async () => {
    if (!user) return alert('코스를 저장하려면 구글 로그인이 필요합니다.');
    if (authBusy || routeRequestRef.current || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const snapshot = { course: JSON.stringify(currentState), sport };
    try {
      if (currentMarkers.length < 2) return alert("저장할 코스가 없어요!");

      if (currentId) {
        if (window.confirm(`수정된 내용이 있습니다.\n기존 코스 [${currentTitle}]에 덮어쓰시겠습니까?\n('취소'를 누르면 새 이름으로 저장합니다.)`)) {
          try {
            await updateCourse(currentId, currentTitle, currentMarkers, currentPolylines, sport);
            alert("✅ 저장 완료!");
            setSavedState(snapshot);
            return;
          } catch {
            alert("저장 실패");
            return;
          }
        }
      }

      const title = prompt("새 코스로 저장합니다. 이름을 입력하세요:", currentTitle !== "새 코스" ? currentTitle : currentSport.defaultTitle);
      if (!title) return;

      try {
        const response = await saveCourse(title, currentMarkers, currentPolylines, sport);
        if (response.data.status === 'success') {
          alert(`✅ 저장 완료!`);
          setCurrentTitle(title);
          setCurrentId(response.data.course_id);
          setSavedState(snapshot);
        }
      } catch { alert("저장 실패: 로그인 상태와 서버 연결을 확인하세요."); }
    } finally { savingRef.current = false; setIsSaving(false); }
  };

  const handleFetchList = async () => {
    if (!user) return alert('내 코스를 보려면 구글 로그인이 필요합니다.');
    const account = user.uid;
    try {
      const response = await getCourseList();
      if (accountRef.current !== account) return;
      setCourseList(response.data);
      setIsLoadModalOpen(true);
    } catch { alert("목록 로드 실패"); }
  };

  const handleLoadCourse = (course) => {
    if (savingRef.current) return;
    if (isModified) {
      if (!window.confirm("수정 중인 내용이 사라집니다. 불러오시겠습니까?")) return;
    }

    try {
      const loadedMarkers = JSON.parse(course.markers_json);
      const loadedPolylines = JSON.parse(course.polylines_json);
      const loadedSport = isSport(course.sport) ? course.sport : 'bike';
      cancelRoute();
      reset({ markers: loadedMarkers, polylines: loadedPolylines });
      if (loadedMarkers.length > 0) setCenter(loadedMarkers[0]);
      setIsLoadModalOpen(false);
      setIsChartOpen(true);

      setSport(loadedSport);
      writeStored('trazo:sport', loadedSport);
      setCurrentTitle(course.title);
      setCurrentId(course.id);
      setSavedState({ course: JSON.stringify({ markers: loadedMarkers, polylines: loadedPolylines }), sport: loadedSport });
    } catch { alert("데이터 오류"); }
  };

  const exportName = currentTitle !== "새 코스" ? currentTitle : currentSport.defaultTitle;

  const handleDownloadGpx = () => {
    if (currentPolylines.length === 0) return alert("경로가 없습니다.");
    const gpx = buildGpx(currentPolylines, { name: exportName, type: currentSport.gpxType });
    downloadBlob(new Blob([gpx], { type: 'application/gpx+xml' }), `${safeFileName(exportName)}.gpx`);
  };

  const handleDownloadTcx = async () => {
    if (currentPolylines.length === 0) return alert("경로가 없습니다.");
    try {
      const response = await downloadTCX(flattenCourse(currentPolylines), { name: exportName, speedKmh: speedBySport[sport] });
      downloadBlob(new Blob([response.data]), `${safeFileName(exportName)}.tcx`);
    } catch { alert("TCX 생성 실패"); }
  };

  const handleResetApp = () => {
    if (savingRef.current) return;
    if (isModified && !window.confirm("저장하지 않은 코스가 사라집니다. 새 코스를 시작하시겠습니까?")) return;

    cancelRoute();
    reset(EMPTY_COURSE);
    if (hoverMarkerRef.current) hoverMarkerRef.current.setVisible(false);

    setCurrentTitle("새 코스");
    setCurrentId(null);
    setSavedState({ course: JSON.stringify(EMPTY_COURSE), sport });
    // 새 코스는 종목부터 고릅니다.
    setIsSportPickerOpen(true);
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

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Map center={center} style={{ width: '100%', height: '100%' }} level={5} onClick={handleMapClick} onCreate={setMap}>
          {currentPolylines.map((path, idx) => (
            // 밝은 종목 색이 지도 위에서도 잘 보이도록 짙은 테두리 선을 먼저 그립니다.
            <Polyline key={`o-${idx}`} path={path} strokeWeight={9} strokeColor={COLORS.primary} strokeOpacity={0.45} strokeStyle={"solid"} />
          ))}
          {currentPolylines.map((path, idx) => (
            <Polyline key={`l-${idx}`} path={path} strokeWeight={5} strokeColor={currentSport.color} strokeOpacity={0.95} strokeStyle={"solid"} />
          ))}
          {kmMarkers.map(marker => (
            <CustomOverlayMap key={`km-${marker.km}`} position={marker} zIndex={3}>
              <div style={{
                padding: '1px 6px', borderRadius: '999px', fontSize: '11px', fontWeight: 800,
                backgroundColor: COLORS.white, color: COLORS.primary, border: `2px solid ${currentSport.color}`,
                boxShadow: SHADOWS.button, whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {marker.km}km
              </div>
            </CustomOverlayMap>
          ))}
          {currentMarkers.map((pos, idx) => {
            let imageSrc = ICONS.WAYPOINT;
            if (idx === 0) imageSrc = ICONS.START;
            else if (idx === currentMarkers.length - 1) imageSrc = ICONS.END;
            return <MapMarker key={`m-${idx}`} position={pos} zIndex={idx === 0 ? 5 : 4} image={{ src: imageSrc, size: { width: 20, height: 20 }, options: { offset: { x: 10, y: 10 } } }} />;
          })}
        </Map>

        {currentMarkers.length === 0 && !isSportPickerOpen && (
          <div role="status" style={{
            position: 'absolute', top: 16, left: 16, zIndex: 5, maxWidth: 'min(360px, calc(100vw - 32px))',
            backgroundColor: COLORS.white, color: COLORS.textMain, padding: '12px 14px', borderRadius: '10px',
            boxShadow: SHADOWS.card, borderLeft: `4px solid ${currentSport.color}`, fontSize: '13px', lineHeight: 1.5,
          }}>
            <strong>{currentSport.icon} {currentSport.label} 코스 만들기</strong><br />
            {currentSport.emptyHint}
          </div>
        )}

        {(isRouting || routeError) && (
          <div role={routeError ? 'alert' : 'status'} style={{
            position: 'absolute', bottom: 20, left: 16, zIndex: 15, maxWidth: 'calc(100vw - 32px)',
            background: COLORS.white, color: COLORS.textMain, padding: 14, borderRadius: 10, boxShadow: SHADOWS.card,
            display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13,
          }}>
            {isRouting ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {currentSport.icon} {currentSport.label} 길을 찾는 중…
                <Button size="small" variant="outline" onClick={cancelRoute}>취소</Button>
              </div>
            ) : <>
              <div>{routeError.message}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Button size="small" onClick={() => addPoint(routeError.point, routeError.mode)}>재시도</Button>
                <Button size="small" variant="secondary" onClick={() => addPoint(routeError.point, 'straight')}>직선 연결</Button>
                <Button size="small" variant="outline" onClick={() => setRouteError(null)}>닫기</Button>
              </div>
            </>}
          </div>
        )}
        <ControlPanel
          sport={sport}
          onChangeSport={handleChangeSport}
          markerCount={currentMarkers.length}
          isLoop={isLoop}
          stats={stats}
          speedKmh={speedBySport[sport]}
          onChangeSpeed={handleChangeSpeed}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo && !isRouting && !isSaving}
          canRedo={canRedo && !isRouting && !isSaving}
          onCloseLoop={handleCloseLoop}
          onOutAndBack={handleOutAndBack}
          onSave={handleSave}
          onList={handleFetchList}
          onDownloadGpx={handleDownloadGpx}
          onDownloadTcx={handleDownloadTcx}
          onReset={handleResetApp}
          isAutoRouting={isAutoRouting}
          onToggleAutoRouting={setIsAutoRouting}
          routeOptions={routeOptionsBySport[sport]}
          onToggleRouteOption={handleToggleRouteOption}
          currentTitle={currentTitle}
          isModified={isModified}
          isBusy={isRouting || isSaving}
          isSaving={isSaving}
          user={user}
          authLoading={authLoading}
          authBusy={authBusy}
          authError={authError}
          authConfigured={Boolean(auth)}
          onAuth={handleAuth}
        />
      </div>

      {currentPolylines.length > 0 && (
        <div style={{ position: 'relative', zIndex: 20 }}>
          <button
            onClick={() => setIsChartOpen(!isChartOpen)}
            style={{
              position: 'absolute', top: '-30px', right: '20px', height: '30px',
              backgroundColor: COLORS.white,
              border: `1px solid ${COLORS.border}`, borderBottom: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer',
              padding: '0 15px', fontSize: '13px', fontWeight: 'bold', color: COLORS.primary,
              boxShadow: '0 -3px 5px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {isChartOpen ? '▼ 고도 차트 닫기' : '▲ 고도 차트 보기'}
          </button>
          <div style={{
            height: isChartOpen ? '220px' : '0px', transition: 'height 0.3s ease-in-out', overflow: 'hidden',
            backgroundColor: COLORS.white, borderTop: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'row'
          }}>
            <div style={{ flex: 1, minWidth: 0, position: 'relative', padding: '10px' }}>
              <ElevationChart polylines={currentPolylines} zones={currentSport.gradeZones} onHoverPoint={updateHoverMarker} />
            </div>
            <GradientLegend zones={currentSport.gradeZones} />
          </div>
        </div>
      )}

      <LoadCourseModal
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
        courseList={courseList}
        onLoad={handleLoadCourse}
        onRefresh={handleFetchList}
      />
      <SportPicker isOpen={isSportPickerOpen} onSelect={handlePickSport} />
    </div>
  );
}

export default App;
