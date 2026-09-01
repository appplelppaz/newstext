"""NEWSTEXT が購読するフィード一覧。fetch_feeds.py が参照する。

各言語、硬いニュース面だけでなく生活・文化面も含める —
誌面6コーナーのうち4つが日常・文化側だから。
"""

FEEDS = {
    "en": [
        ("BBC News",            "https://feeds.bbci.co.uk/news/rss.xml",                  "ニュース"),
        ("BBC Entertainment",   "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", "文化"),
        ("The Guardian UK",     "https://www.theguardian.com/uk/rss",                     "ニュース"),
        ("Guardian Life&Style", "https://www.theguardian.com/lifeandstyle/rss",           "生活"),
    ],
    "zh": [
        # 人民网の各面は更新が止まったアーカイブを返すため不採用。
        ("中国新闻网",         "http://www.chinanews.com/rss/scroll-news.xml", "ニュース"),
        ("中国新闻网 社会",     "http://www.chinanews.com/rss/society.xml",     "生活"),
        ("中国新闻网 国際",     "http://www.chinanews.com/rss/world.xml",       "ニュース"),
        ("中国新闻网 スポーツ",  "http://www.chinanews.com/rss/sports.xml",      "スポーツ"),
        ("BBC中文",           "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml", "ニュース"),
    ],
    "es": [
        ("El País",            "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada", "ニュース"),
        ("El País Gastronomía","https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/gastronomia/portada", "生活"),
        ("20minutos",          "https://www.20minutos.es/rss/",                                   "ニュース"),
    ],
    "fr": [
        ("France 24",         "https://www.france24.com/fr/rss",         "ニュース"),
        ("France 24 Culture", "https://www.france24.com/fr/culture/rss", "文化"),
        ("RFI",               "https://www.rfi.fr/fr/rss",               "ニュース"),
        ("Le Figaro",         "https://www.lefigaro.fr/rss/figaro_actualites.xml", "ニュース"),
    ],
}

COUNTRY = {"en": "イギリス", "zh": "中国", "es": "スペイン", "fr": "フランス"}
