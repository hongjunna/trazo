# 지도 자동 업데이트 스케줄러: Docker CLI로 그래프 생성 컨테이너와 GraphHopper 재시작을 제어합니다.
FROM docker:27-cli
RUN apk add --no-cache bash curl coreutils util-linux tzdata
COPY scheduler.sh /usr/local/bin/osm-update-scheduler
ENTRYPOINT ["bash", "/usr/local/bin/osm-update-scheduler"]
