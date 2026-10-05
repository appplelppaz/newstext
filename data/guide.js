// 学習法の根拠（Method）と試験の攻略（Exam）。どちらも書き下ろし
window.GUIDE = {
  method: [
    {
      h: 'インプットを先に、アウトプットは後から',
      why: '理解できる大量のインプットが習得の土台になる（Krashen 1985）。語彙が足りないうちに翻訳や作文をしても、知らない語は出てこない。1級の長文は語彙の98%前後が分かって初めて辞書なしで読めるとされる（Hu & Nation 2000; Laufer & Ravenhorst-Kalovski 2010）。',
      how: 'P1（10〜12月）は文法の理解・語彙・多読・リスニングだけにし、翻訳は1月から始める。',
    },
    {
      h: 'ただし「小さなアウトプット」は最初から',
      why: '話したり書いたりしようとすると「言いたいのに言えない」穴に気づき、その後のインプットで注目する点が変わる（Swain 1995 の気づき機能）。',
      how: 'P1 でも、間違えた語で自分の例文を1つ作る欄と、短い文のシャドーイングを入れる。採点される翻訳ではなく、穴に気づくためのアウトプット。',
    },
    {
      h: '4つの柱をバランスよく',
      why: '意味重視のインプット、意味重視のアウトプット、言語形式の学習、流暢さの訓練を、長期的にはおおむね同じ比重で行うのがよい（Nation 2007 “The Four Strands”）。',
      how: 'P1 はインプットと形式の学習が中心。P2 で翻訳（アウトプット）を足し、P3〜P4 で過去問を時間内に解く（流暢さ）比重を上げる。1年全体で4つがそろう配分にしている。',
    },
    {
      h: '覚えたかを「テスト」で確かめる',
      why: '読み直すより思い出す練習（テスト）をしたほうが、1週間後の記憶がはっきり多い（Roediger & Karpicke 2006）。学習法の総説でも、練習テストと分散学習は「効果が高い」と評価されている（Dunlosky et al. 2013）。',
      how: 'Idioms・Exam Vocab・Mistakes は、答えを見る前に必ず自分で思い出させる。チェックポイント（CP0〜CP6）も、測定であると同時に学習になる。',
    },
    {
      h: '間隔を空けて復習する',
      why: '覚えてから復習までの最適な間隔は、覚えておきたい期間に応じて長くなる。数週間後の試験なら間隔はその約20%、1年後なら約5〜10%（Cepeda et al. 2008）。',
      how: '復習カードは1→2→4→8→16→32→64→120日と間隔を広げる。試験まで1年あるので、早い時期に覚えた語ほど長い間隔で何度も戻ってくる。',
    },
    {
      h: '「なぜ」を説明できる形で覚える',
      why: '「なぜそうなるのか」を自分に問いかけて説明する学習（精緻化質問・自己説明）は、丸暗記より理解と保持を助ける（Dunlosky et al. 2013）。',
      how: '4択の解き直しでは、答えを選んだあとに理由を選んでから解説を見る。勘で当たった問題は「分かっていない」とみなして復習に回す。',
    },
    {
      h: '漢字の「字」から語を理解する',
      why: '中国語の語の大半は複合語で、構成する字の意味が分かると未知語の意味を推測しやすくなる（形態素意識: Ku & Anderson 2003）。漢字を知っている日本語話者には大きな強みだが、和製漢語との意味のずれが落とし穴にもなる。',
      how: '語彙の解説では字ごとに意味を分け、同じ字を含む語をまとめて示す。日本語の意味に引きずられやすい語には注意を付ける。',
    },
    {
      h: '種類を混ぜて練習する',
      why: '同じ種類の問題を続けて解くより、種類を混ぜて解いたほうが「どの知識を使う問題か」を見分ける力がつき、後のテストの成績が上がる（交互練習: Rohrer & Taylor 2007 ほか）。',
      how: '毎日の復習は、成語・語彙・文法・ピンインの問題を混ぜて出す。',
    },
    {
      h: '耳は「音」と「意味」を分けて鍛える',
      why: 'シャドーイングは主に音の聞き取り（音素の知覚）を伸ばし、内容理解は別に練習が必要だという結果がある（Hamada 2016）。',
      how: 'リスニングは、通し聞きで内容 → 原稿で確認 → 1文ずつの書き取り → シャドーイング、の順に行う。',
    },
    {
      h: '測って、弱点に時間を回す',
      why: '限られた時間で最大の効果を出すには、できている所の繰り返しを減らし、できていない所に時間を回す必要がある。',
      how: 'チェックポイントと過去問の結果から、分野別・原因別に弱点を出し、次のチェックポイントまでの毎日の Focus タスクに自動で入れる。',
    },
    {
      h: 'Apple Pencil は「本番で手で書く所」だけに使い、記述は Claude で添削する',
      why: '中検の記述（日文中訳・作文・要約・書き取り・ピンインの漢字書き）はすべて紙に手書きする。練習の形を本番に合わせるほど、本番で覚えたことを引き出しやすい（転移適切処理：Morris, Bransford & Franks 1977）。中国語の学習では、手で書くことが字形の記憶と読みの力を支えることが示されている（Tan et al. 2005; Guan et al. 2011）。一方、作文や翻訳は答えが一つではなく、解答例との文字の一致では採点できない。自己採点では、自分で気づけない誤り（コロケーション・語順・和製漢語）が減点されない。',
      how: '書き取り・ピンインの漢字書き・Hanzi デッキは、原稿用紙のマス目に Pencil で書き、解答例を重ねて字形まで確かめる。作文・中訳・要約は、入力欄に Pencil で書いてスクリブルで文字にし、字数・指定語・繁体字の混用は自動でチェックする。Check の後に「Claude で添削」を押すと、原文・解答例・採点の観点・自分の答えが Claude アプリに渡り、誤りごとの理由・直した全文・点数（SCORE）が返ってくる。その点数を点数欄に入れて記録する。4択・ピンイン・成語の意味は「認識」の問題なのでタップで速く量をこなす。本文へのマーカーは学習効果が低い（Dunlosky et al. 2013）ので付けず、今の設問の空欄を自動で強調する。',
    },
  ],
  refs: [
    'Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. Psychological Science, 19, 1095–1102.',
    'Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students’ learning with effective learning techniques. Psychological Science in the Public Interest, 14(1), 4–58.',
    'Guan, C. Q., Liu, Y., Chan, D. H. L., Ye, F., & Perfetti, C. A. (2011). Writing strengthens orthography and alphabetic-coding strengthens phonology in learning to read Chinese. Journal of Educational Psychology, 103(3), 509–522.',
    'Hamada, Y. (2016). Shadowing: Who benefits and how? Uncovering a booming EFL teaching technique for listening comprehension. Language Teaching Research, 20(1), 35–52.',
    'Hu, M., & Nation, I. S. P. (2000). Unknown vocabulary density and reading comprehension. Reading in a Foreign Language, 13(1), 403–430.',
    'Krashen, S. (1985). The Input Hypothesis: Issues and Implications. Longman.',
    'Ku, Y.-M., & Anderson, R. C. (2003). Development of morphological awareness in Chinese and English. Reading and Writing, 16, 399–422.',
    'Laufer, B., & Ravenhorst-Kalovski, G. C. (2010). Lexical threshold revisited. Reading in a Foreign Language, 22(1), 15–30.',
    'Morris, C. D., Bransford, J. D., & Franks, J. J. (1977). Levels of processing versus transfer appropriate processing. Journal of Verbal Learning and Verbal Behavior, 16, 519–533.',
    'Nation, P. (2007). The four strands. Innovation in Language Learning and Teaching, 1(1), 2–13.',
    'Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17, 249–255.',
    'Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35, 481–498.',
    'Swain, M. (1995). Three functions of output in second language learning. In G. Cook & B. Seidlhofer (Eds.), Principle and Practice in Applied Linguistics (pp. 125–144). Oxford University Press.',
    'Tan, L. H., Spinks, J. A., Eden, G. F., Perfetti, C. A., & Siok, W. T. (2005). Reading depends on writing, in Chinese. Proceedings of the National Academy of Sciences, 102(24), 8781–8785.',
  ],

  exam: {
    format: [
      ['Listening 1', '4択10問（長めの文章2つ×5問）', '60'],
      ['Listening 2', '聞いて要約（1級180〜200字、準1級130〜150字）。3回読まれ、記入時間15分', '40'],
      ['Written 1', '長文：空欄補充・ピンイン・内容一致 10問', '20'],
      ['Written 2', '空欄補充（語彙・成語・量詞・慣用表現）10問', '20'],
      ['Written 3', '下線部の説明（成語・慣用句・俗語）10問', '20'],
      ['Written 4', '長文の下線部を日本語に訳す（2か所）', '20'],
      ['Written 5', '日本語を中国語に訳す（2題）', '20'],
    ],
    pass: '合格基準点はリスニング・筆記それぞれ100点満点中、1級は85点、準1級は75点（回によって調整されることがある）。両方が基準点に届く必要がある。',
    time: [
      ['Written 2・3（語彙・成語）', '15分', '迷ったら印を付けて先へ。ここで時間を使いすぎない'],
      ['Written 1（長文）', '20分', '先に設問を見て、空欄の前後2文を読んで判断する'],
      ['Written 4（中文日訳）', '25分', '下線部の前後を読み、指示語や省略を補って訳す'],
      ['Written 5（日文中訳）', '40分', '構文を決めてから書く。分からない語は言い換えで逃げる'],
      ['見直し', '20分', '翻訳の誤字・脱字、簡体字と繁体字の混用、マークのずれ'],
    ],
    tips: {
      listening: [
        '設問と選択肢は音声で読まれるだけで、問題用紙には印刷されていない。本文を聞きながら、数字・人名・理由を表す語をメモしておく。',
        '「与本文内容相符的是」は最後に問われる。本文の主張と、言い過ぎ（都・一定・完全）の選択肢を区別する。',
        '要約は1回目で全体の流れ、2回目で要点（数字・固有名詞・結論）、3回目で抜けを埋める。',
        '要約は「何が・どうした・なぜ・結果どうなる」の骨組みで書き、例や会話文は削る。字数の下限を下回ると大きく減点されるので、最後に必ず数える（句読点も1字）。',
      ],
      written: [
        '語彙問題は、同じ字を含む選択肢が並ぶことが多い（例: 接洽／接待／接风／接济）。共通の字ではなく「違う字」の意味で判断する。',
        '成語の問題は、褒め言葉か、けなし言葉か（褒義・贬义）と、誰に対して使う語か（自分・他人）を先に判断すると選択肢が絞れる。',
        '「適当でないもの」を選ぶ問題は毎回のように出る。設問文の「でない」に印を付ける。',
        'ピンイン問題は多音字（例: 颇 pō、处 chǔ/chù、长 cháng/zhǎng）と、日本語の音読みからの類推で誤る字が狙われる。',
      ],
      translation: [
        '中文日訳は、直訳で意味が通らない所を自然な日本語に直す。主語の補い、指示語の中身の明示、長い連体修飾の分割が採点の差になる。',
        '日文中訳は、日本語の語順のまま訳さない。時間・場所・方式は動詞の前、結果・程度は動詞の後（補語）。',
        '「〜と言われている」は“据说／一般认为”、「〜にもかかわらず」は“尽管…却…”、「〜につれて」は“随着…”のように、決まった型を持っておく。',
        '和製漢語に注意（例: 「勉強」≠“勉强”、「出動」は“出动”で可、「地元」は“当地”）。',
      ],
    },
    day: [
      '鉛筆・シャープペンシル・消しゴム・受験票・時計（音の出ないもの）',
      '簡体字か繁体字のどちらか一方に統一する（混用は減点）',
      'リスニングの解答用紙はリスニング終了後すぐ回収される。転記の時間はない',
      'リスニング中は筆記に進めない。終了の案内を待つ',
    ],
  },
};
