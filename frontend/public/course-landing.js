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
    } catch {
      node.innerHTML = fallback;
    }
  });
})();
