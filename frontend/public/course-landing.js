/* 서버에서 제공한 경로 미리보기를 실제 지도로 확장합니다. SDK 실패 시 SVG를 유지합니다. */
(() => {
  if (!window.kakao?.maps) return;
  const data = JSON.parse(document.getElementById('course-data').textContent);
  if (!data.length) return;
  window.kakao.maps.load(() => {
    const node = document.getElementById('course-map');
    const fallback = node.innerHTML;
    try {
      node.innerHTML = '';
      const maps = window.kakao.maps;
      const first = data[0][0];
      const map = new maps.Map(node, { center: new maps.LatLng(first.lat, first.lng), level: 6 });
      const bounds = new maps.LatLngBounds();
      data.forEach(segment => {
        const path = segment.map(point => {
          const position = new maps.LatLng(point.lat, point.lng);
          bounds.extend(position);
          return position;
        });
        new maps.Polyline({ map, path, strokeWeight: 5, strokeColor: '#0b616a', strokeOpacity: 0.9 });
      });
      new maps.Marker({ map, position: new maps.LatLng(first.lat, first.lng), title: '출발점' });
      map.setBounds(bounds, 40, 40, 40, 40);
      // 고도 프로필(course-elevation.js)에서 훑는 위치를 지도에 점으로 표시합니다.
      const dot = document.createElement('div');
      dot.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#0b616a;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)';
      const hover = new maps.CustomOverlay({ content: dot, xAnchor: 0.5, yAnchor: 0.5, zIndex: 5 });
      window.addEventListener('trazo:elevation-hover', event => {
        const point = event.detail;
        if (!point) return hover.setMap(null);
        hover.setPosition(new maps.LatLng(point.lat, point.lng));
        hover.setMap(map);
      });
    } catch {
      node.innerHTML = fallback;
    }
  });
})();
