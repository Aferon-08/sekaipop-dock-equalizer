#!/usr/bin/env python3
"""Read a public YouTube video's duration; no media, cookies or disk cache."""
import json
import re
import sys
from urllib.request import Request, urlopen


def duration(video_id):
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        return 0
    request = Request("https://www.youtube.com/watch?v=" + video_id,
                      headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=8) as response:
        page = response.read(4_000_000).decode("utf-8", errors="replace")
    for match in re.finditer(r"ytInitialPlayerResponse\s*=\s*", page):
        try:
            data, _ = json.JSONDecoder().raw_decode(page[match.end():])
            details = data.get("videoDetails", {})
            if details.get("videoId") != video_id or details.get("isLiveContent"):
                continue
            seconds = int(details.get("lengthSeconds", 0))
            if 0 < seconds <= 604800:
                return seconds
        except (ValueError, TypeError, AttributeError):
            continue
    return 0


if __name__ == "__main__":
    video_id = sys.argv[1] if len(sys.argv) == 2 else ""
    try:
        seconds = duration(video_id)
    except Exception:
        seconds = 0
    print(json.dumps({"id": video_id, "seconds": seconds}))
