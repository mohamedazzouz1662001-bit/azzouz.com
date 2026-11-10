#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AZZOUZ Crawler V2 — بحث متطور كيتمدد
كيقلب فـ Surface + Deep (HTML, PDF, ملفات نصية) وكيحترم robots.txt.

الاستعمال:
    python3 crawler_v2.py "طنجة" https://ar.wikipedia.org/wiki/طنجة
    python3 crawler_v2.py "طنجة" https://ar.wikipedia.org/wiki/طنجة --pages 30 --depth 2
"""
import json
import sys
import time
import urllib.robotparser as robotparser
from collections import deque
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

OK_TYPES = ("text/html", "application/pdf", "text/plain")
BAD_URL = (
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".mp4", ".mp3",
    ".zip", ".rar", ".exe", ".apk", ".dmg", ".css", ".js", ".ico",
    "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com",
    "login", "signin", "logout", "cart", "checkout",
)


class SmartCrawler:
    def __init__(self, max_pages=100, max_depth=3, delay=1.0, same_site=True):
        self.queue = deque()
        self.visited = set()
        self.results = []
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.delay = delay
        self.same_site = same_site
        self.robots = {}
        self.headers = {"User-Agent": "AZZOUZ-Bot/2.0 (+research; contact: owner)"}

    # ---------- قوانين ----------
    def allowed(self, url):
        host = urlparse(url).netloc
        rp = self.robots.get(host)
        if rp is None:
            try:
                r = requests.get(f"https://{host}/robots.txt", headers=self.headers, timeout=8)
                if r.status_code == 200:
                    rp = robotparser.RobotFileParser()
                    rp.parse(r.text.splitlines())
                else:
                    rp = False  # بلا robots.txt = مسموح
            except Exception:
                rp = False
            self.robots[host] = rp
        if rp is False:
            return True
        try:
            return rp.can_fetch(self.headers["User-Agent"], url)
        except Exception:
            return True

    def is_valid(self, url):
        if not str(url).startswith("http"):
            return False
        low = url.lower()
        if any(x in low for x in BAD_URL):
            return False
        return True

    # ---------- القراءة ----------
    def fetch(self, url):
        try:
            r = requests.get(url, headers=self.headers, timeout=12, allow_redirects=True)
        except Exception as e:
            print(f"خطأ فـ {url}: {e}")
            return [], "", "", None

        if r.status_code != 200:
            return [], "", "", None

        ctype = (r.headers.get("Content-Type") or "").lower()
        if not any(t in ctype for t in OK_TYPES):
            return [], "", "", ctype

        if "pdf" in ctype:
            text = ""
            try:
                import io
                from pypdf import PdfReader

                reader = PdfReader(io.BytesIO(r.content))
                text = "\n".join((p.extract_text() or "") for p in reader.pages[:20])
            except Exception:
                text = ""
            return [], url.rsplit("/", 1)[-1], text[:6000], ctype

        soup = BeautifulSoup(r.text, "html.parser")
        for t in soup(["script", "style", "nav", "footer"]):
            t.decompose()
        title = (soup.title.string or "").strip() if soup.title else "بلا عنوان"
        text = " ".join(soup.get_text(" ").split())[:6000]
        links = []
        for a in soup.find_all("a", href=True):
            full = urljoin(url, a["href"].split("#")[0])
            if self.is_valid(full):
                links.append(full)
        return links, title, text, ctype

    # ---------- التمدد ----------
    def crawl(self, start_urls, keyword):
        print(f"بدينا البحث على: {keyword}")
        base_host = urlparse(start_urls[0]).netloc
        for u in start_urls:
            self.queue.append((u, 0))

        while self.queue and len(self.visited) < self.max_pages:
            url, depth = self.queue.popleft()
            if url in self.visited or depth > self.max_depth:
                continue
            if self.same_site and urlparse(url).netloc != base_host:
                continue
            if not self.allowed(url):
                continue

            self.visited.add(url)
            print(f"[{len(self.visited)}] {url} (عمق {depth})")

            links, title, text, ctype = self.fetch(url)
            hit = keyword.lower() in (text + " " + title).lower()
            if hit:
                self.results.append({
                    "url": url,
                    "title": title,
                    "depth": depth,
                    "type": ctype or "",
                    "snippet": text[:220],
                })
                print(f"  >>> لقيت: {title}")

            if depth < self.max_depth:
                for link in links:
                    if link not in self.visited:
                        self.queue.append((link, depth + 1))

            time.sleep(self.delay)

        print(f"خلصنا: {len(self.visited)} صفحة، {len(self.results)} نتيجة")
        return self.results

    def save(self, filename="results.json"):
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(self.results, f, ensure_ascii=False, indent=2)
        print(f"تسجلو {len(self.results)} نتيجة فـ {filename}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    kw = args[0] if args else "طنجة"
    start = [a for a in args[1:] if a.startswith("http")] or ["https://ar.wikipedia.org/wiki/طنجة"]
    pages = 10
    depth = 1
    for i, a in enumerate(sys.argv):
        if a == "--pages" and i + 1 < len(sys.argv):
            pages = int(sys.argv[i + 1])
        if a == "--depth" and i + 1 < len(sys.argv):
            depth = int(sys.argv[i + 1])
        if a == "--all-sites":
            pass

    c = SmartCrawler(max_pages=pages, max_depth=depth, delay=0.5)
    res = c.crawl(start, keyword=kw)
    c.save()
    for r in res[:10]:
        print(f"- {r['title']} → {r['url']} (عمق {r['depth']})")
