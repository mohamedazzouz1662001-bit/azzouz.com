#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AZZOUZ AI — Auto Fixer PRO
كيدور بوحدو: كيجرب الكود، كيلقا الخطأ، كيصلحو، وكيعاود. حتى ينجح ولا يوصل للحد.

الاستعمال:
    python3 auto_fixer.py                      # كيصلح app.py
    python3 auto_fixer.py server.py 15         # ملف + عدد المحاولات
    AZZOUZ_AI_URL=... python3 auto_fixer.py    # كيربط مع AI حقيقي

متغيرات البيئة (اختيارية):
    AZZOUZ_AI_URL     رابط الـAI اللي كيرجع الكود مصلح (JSON: {"fixed": "..."})
    AZZOUZ_AI_KEY     مفتاح الـAI (كيتبعت فـAuthorization)
    AZZOUZ_NOTIFY_URL webhook باش يصيفط ليك النتيجة فواتساب/سلاك
    AZZOUZ_ALLOW_PIP  =1 باش يثبت المكتبات الناقصة بوحدو
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime

FILE_TO_FIX = sys.argv[1] if len(sys.argv) > 1 else "app.py"
MAX_TRIES = int(sys.argv[2]) if len(sys.argv) > 2 else 10
WAIT_SECONDS = 3
LOG = "auto_fixer.log"
AI_URL = os.environ.get("AZZOUZ_AI_URL", "").strip()
AI_KEY = os.environ.get("AZZOUZ_AI_KEY", "").strip()
NOTIFY_URL = os.environ.get("AZZOUZ_NOTIFY_URL", "").strip()
ALLOW_PIP = os.environ.get("AZZOUZ_ALLOW_PIP") == "1"


def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def read_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def notify(text):
    if not NOTIFY_URL:
        return
    try:
        req = urllib.request.Request(
            NOTIFY_URL,
            data=json.dumps({"message": text}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:  # noqa: BLE001
        log(f"تعذر الإشعار: {e}")


def run_test():
    log("🔍 كنجرب الكود...")
    try:
        result = subprocess.run(
            [sys.executable, FILE_TO_FIX],
            capture_output=True, text=True, timeout=60,
        )
    except subprocess.TimeoutExpired:
        log("⏱️ الكود طوّل بزاف (timeout)")
        return False, "TimeoutExpired"
    if result.returncode == 0:
        log("✅ صافي! الكود خدام بلا خطأ")
        return True, ""
    error = (result.stderr or result.stdout or "").strip()
    log("❌ لقيت خطأ: " + error.splitlines()[-1][:200] if error else "❌ خطأ بلا رسالة")
    return False, error


def ask_ai(code, error):
    """كيرجع الكود مصلح من الـAI، ولا None إلا ما كانش مضبوط."""
    if not AI_URL:
        return None
    log("🤖 كنطلب الإصلاح من AZZOUZ AI...")
    payload = json.dumps({
        "file": FILE_TO_FIX,
        "code": code,
        "error": error[-4000:],
        "instruction": "أرجع الملف كامل مصلح فقط، بلا شرح، داخل JSON بهذا الشكل: {\"fixed\": \"...\"}",
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if AI_KEY:
        headers["Authorization"] = "Bearer " + AI_KEY
    try:
        req = urllib.request.Request(AI_URL, data=payload, headers=headers)
        raw = urllib.request.urlopen(req, timeout=120).read().decode("utf-8", "replace")
        data = json.loads(raw)
        fixed = data.get("fixed") or data.get("code") or ""
        fixed = fixed.strip()
        if fixed.startswith("```"):
            fixed = re.sub(r"^```[a-zA-Z]*\n|\n```$", "", fixed).strip()
        return fixed or None
    except Exception as e:  # noqa: BLE001
        log(f"⚠️ الـAI ما جاوابش: {e}")
        return None


def heuristic_fix(code, error):
    """إصلاحات محلية للأخطاء الشائعة، بلا API."""
    fixed = code
    missing = re.search(r"No module named '([\w\-.]+)'", error)
    if missing:
        module = missing.group(1).split(".")[0]
        if ALLOW_PIP:
            log(f"📦 كنثبت المكتبة الناقصة: {module}")
            subprocess.run([sys.executable, "-m", "pip", "install", module],
                           capture_output=True, text=True, timeout=180)
            return fixed
        log(f"📦 المكتبة الناقصة: {module} (شغّل pip install {module}، ولا فعّل AZZOUZ_ALLOW_PIP=1)")
        return fixed
    name = re.search(r"NameError: name '(\w+)' is not defined", error)
    if name and name.group(1) in ("requests", "json", "time", "os", "sys", "re"):
        return f"import {name.group(1)}\n" + fixed
    if "IndentationError" in error or "TabError" in error:
        lines = [ln.replace("\t", "    ").rstrip() for ln in fixed.splitlines()]
        return "\n".join(lines) + "\n"
    return fixed


def main():
    if not os.path.exists(FILE_TO_FIX):
        log(f"🛑 الملف ما كاينش: {FILE_TO_FIX}")
        sys.exit(2)
    log(f"🚀 AZZOUZ Auto-Fixer بدا — الملف: {FILE_TO_FIX} — المحاولات: {MAX_TRIES}")
    backup = f"{FILE_TO_FIX}.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(FILE_TO_FIX, backup)
    log(f"🗂️ نسخة احتياطية: {backup}")

    seen = set()
    for attempt in range(1, MAX_TRIES + 1):
        log(f"--- المحاولة {attempt}/{MAX_TRIES} ---")
        ok, error = run_test()
        if ok:
            notify(f"✅ Auto-Fixer: {FILE_TO_FIX} تصاوب فالمحاولة {attempt}.")
            log("🎉 سالينا! الكود تصاوب بوحدو")
            return 0

        signature = error.splitlines()[-1][:160] if error else "unknown"
        if signature in seen:
            log("⚠️ نفس الخطأ تعاود — ما كاين فايدة نعاود بلا تدخل.")
            notify(f"🛑 Auto-Fixer وقف: نفس الخطأ تعاود ف{FILE_TO_FIX}:\n{signature}")
            return 1
        seen.add(signature)

        current = read_file(FILE_TO_FIX)
        new_code = ask_ai(current, error) or heuristic_fix(current, error)

        if "client_key" in error.lower():
            log("🛑 المشكل فإعدادات client_key — خاص تدخل من عندك، ماشي من الكود.")
            notify("🛑 Auto-Fixer: المشكل فclient_key، خاص تدخل يدوي.")
            return 1

        if new_code == current:
            log("⚠️ ما تبدل والو، كنعاود ننتظر...")
            time.sleep(WAIT_SECONDS)
            continue

        shutil.copy2(FILE_TO_FIX, backup)
        write_file(FILE_TO_FIX, new_code)
        log("💾 حفظت الإصلاح و غادي نعاود نجرب...")
        time.sleep(WAIT_SECONDS)

    notify(f"❌ Auto-Fixer: سالاو {MAX_TRIES} محاولة و{FILE_TO_FIX} مازال فيه خطأ.")
    log("❌ سالاو المحاولات و ما تصاوبش. شوفو بيدك.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
