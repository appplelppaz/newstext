"""号 = ISO週。号IDと週の範囲・誌面表記の相互変換。"""

import datetime as dt

JP_WEEKDAY = "月火水木金土日"


def current_issue(today=None):
    """今日が属する号ID（例 '2026-W36'）。"""
    d = today or dt.date.today()
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def issue_range(issue):
    """号IDから (月曜, 日曜) の date を返す。"""
    y, w = issue.split("-W")
    monday = dt.date.fromisocalendar(int(y), int(w), 1)
    return monday, monday + dt.timedelta(days=6)


def issue_label(issue):
    """誌面表記。例 '2026年9月 第1週号'。

    ISO の慣例に従い、週は「その週の木曜日が属する月」のものとして数える。
    月をまたぐ週（8/31月〜9/6日 など）を直感どおりに扱うため。
    """
    monday, _ = issue_range(issue)
    thursday = monday + dt.timedelta(days=3)
    nth = (thursday.day - 1) // 7 + 1
    return f"{thursday.year}年{thursday.month}月 第{nth}週号"


def issue_dates_label(issue):
    """例 '8/31(月) 〜 9/6(日)'。"""
    mon, sun = issue_range(issue)
    return (f"{mon.month}/{mon.day}({JP_WEEKDAY[mon.weekday()]}) 〜 "
            f"{sun.month}/{sun.day}({JP_WEEKDAY[sun.weekday()]})")


def in_issue_week(date, issue):
    mon, sun = issue_range(issue)
    return mon <= date <= sun
