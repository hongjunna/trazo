"""좋아요 봇: 무작위 간격으로 백엔드에 요청해, 가상 계정 하나가 무작위 공개 코스에 좋아요를 누르게 합니다.

어떤 코스에 어떤 가상 계정으로 누를지는 백엔드(POST /internal/like-bot/like)가 정합니다.
환경 변수
  LIKE_BOT_TOKEN          백엔드와 같은 값. 없으면 아무것도 하지 않고 기다립니다.
  LIKE_BOT_URL            기본값 http://backend:8000/internal/like-bot/like
  LIKE_BOT_MIN_MINUTES    다음 좋아요까지 최소 간격(분), 기본 30
  LIKE_BOT_MAX_MINUTES    최대 간격(분), 기본 240
  LIKE_BOT_QUIET_HOURS    누르지 않는 시간대(한국 시간, 시작-끝), 기본 1-7. 비우면 하루 종일 누릅니다.
"""
import json
import os
import random
import time
import urllib.error
import urllib.request

TOKEN = os.getenv("LIKE_BOT_TOKEN", "").strip()
URL = os.getenv("LIKE_BOT_URL", "http://backend:8000/internal/like-bot/like")
MIN_MINUTES = float(os.getenv("LIKE_BOT_MIN_MINUTES", "30"))
MAX_MINUTES = max(MIN_MINUTES, float(os.getenv("LIKE_BOT_MAX_MINUTES", "240")))
QUIET = os.getenv("LIKE_BOT_QUIET_HOURS", "1-7").strip()


def log(message):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), message, flush=True)


def quiet_now() -> bool:
    if not QUIET:
        return False
    try:
        start, end = (int(part) for part in QUIET.split("-"))
    except ValueError:
        return False
    hour = time.localtime().tm_hour
    return start <= hour < end if start <= end else hour >= start or hour < end


def like_once():
    request = urllib.request.Request(URL, method="POST", data=b"", headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read() or b"{}")


def main():
    if not TOKEN:
        log("LIKE_BOT_TOKEN이 없어 좋아요 봇을 쉬게 둡니다. .env에 값을 넣고 다시 시작하세요.")
        while True:
            time.sleep(3600)
    log(f"좋아요 봇 시작: {MIN_MINUTES:g}~{MAX_MINUTES:g}분 간격, 쉬는 시간 {QUIET or '없음'}")
    # 컨테이너를 다시 시작할 때마다 바로 누르지 않도록 첫 좋아요도 기다린 뒤에 누릅니다.
    while True:
        wait = random.uniform(MIN_MINUTES, MAX_MINUTES) * 60
        log(f"다음 좋아요까지 {wait / 60:.0f}분")
        time.sleep(wait)
        if quiet_now():
            log("쉬는 시간이라 건너뜁니다")
            continue
        try:
            result = like_once()
            if result.get("status") == "liked":
                log(f"좋아요: {result.get('nickname')} → {result.get('title')}")
            else:
                log(f"건너뜀: {result.get('reason')}")
        except (urllib.error.URLError, OSError, ValueError) as error:
            log(f"요청 실패: {error}")


if __name__ == "__main__":
    main()
