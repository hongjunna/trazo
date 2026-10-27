# DB 백업 스케줄러: 운영 DB와 같은 메이저 버전의 pg_dump로 매일 백업합니다.
FROM postgres:15
COPY backup.sh /usr/local/bin/db-backup
RUN chmod 755 /usr/local/bin/db-backup
ENTRYPOINT ["db-backup"]
