// 過去問の一覧（本文は含まない）。本文と解説は Drive の JSON を Papers タブで読み込む。
// level: L1 = 1級、P1 = 準1級。drive: 問題(T)・解答(A)・リスニング原稿(S)の PDF の Drive ファイル ID
window.PAPERS_INDEX = {
  folder: 'https://drive.google.com/drive/folders/1gdY9PB5ktxyKIwSpPol4Cd80-8hIMDgr',
  // 合格基準点（リスニング・筆記それぞれ100点満点）。回によって調整されることがある
  pass: { L1: { listening: 85, written: 85 }, P1: { listening: 75, written: 75 } },
  minutes: { L1: 120, P1: 120 },
  summaryChars: { L1: [180, 200], P1: [130, 150] },
  papers: [
    { id: 'L1-110', level: 'L1', round: 110, date: '2023-11', drive: { T: '16NBEQ-t6n3SwpSbOVZKIQ0jWUk7gYPYC', A: '17aQUgCScDhGP0wgjFoK9FioDD-LdJ9WU', S: '1GOU7UGM0Xo9vYu9qzlBOHjfQu1oVbwNu' } },
    { id: 'L1-113', level: 'L1', round: 113, date: '2024-11', drive: { T: '1h2QjO8-lCscWH11HQe0JCm9urMjhtGif', A: '1WEjS1-z_LWwWTTF8leBtzJnC6NvA2Abc', S: '13u9QZu0kgfIAZheYaZ63PyFbf3HwaxpQ' } },
    { id: 'L1-116', level: 'L1', round: 116, date: '2025-11', drive: { T: '1dqaU3616Gsnx0HfGygutCh60BDeWLHMS', A: '1QPlb6sDiuqgQnEoBJNvXZ5hK-oAw8eo9', S: '1_lfLYpbkzsoKVgNR3U-Qc9XyFirjzazp' } },
    { id: 'P1-108', level: 'P1', round: 108, date: '2023-03', drive: { T: '1QDcFLlz_V2ZKs6d4-jaWeZ9nhJewzx8Y', A: '1SQabJrqnAoDQLAmNtUgBfQXtv1F4DKx8', S: '1Gu-tX1uJjW0GoaNnG6uVLbPv1Qc-qssK' } },
    { id: 'P1-109', level: 'P1', round: 109, date: '2023-06', drive: { T: '1ZpQdAB9MDBTwR_NnHJoVJCEZrQShQUqB', A: '1Xx46BzaVCO_f9bCM9U4AJ8vgDshUB7XP', S: '1lWj5_OgqrKWm8YpQy1rU_lsgqn0QWCdw' } },
    { id: 'P1-110', level: 'P1', round: 110, date: '2023-11', drive: { T: '1mHO7vTUXb_I7THMe4r-Adp5poeyACjJF', A: '1x5imS9JEbgZ8D_IRKh9Sosy45Vad-tTQ', S: '134TXAaFUOzPa4kuYo8sX3Hc-HnAm2H1P' } },
    { id: 'P1-111', level: 'P1', round: 111, date: '2024-03', drive: { T: '1Ysc-cnNWViIp-rAef3f9MpM6Mg-cAJOd', A: '14RuVuftETzrCVmpYbtVAKA7f83fr8RlI', S: '1Fjv2ur0hGTySZQkqlUkePQgJ0BmGBeYU' } },
    { id: 'P1-112', level: 'P1', round: 112, date: '2024-06', drive: { T: '1sxuJrRLn6ziAmHc08FQnDQ53GW_9BaIK', A: '1SvlEil8GovYXCJ3ZM9YdRmziz4VayiTG', S: '11NVUn_17UoSnfgDWor78nE4SiABsydU6' } },
    { id: 'P1-113', level: 'P1', round: 113, date: '2024-11', drive: { T: '1uZv8dIJ1ZwUabIVqIHQRK2TyazcRjphM', A: '1UiVQQ_QEPGTu-NxkJ1_9WMQLnkKkaF3P', S: '1Nx1K-3t-suQ5KyluUfDBXBntb80BzW1W' } },
    { id: 'P1-114', level: 'P1', round: 114, date: '2025-03', drive: { T: '1vGb2SJtsWsWzUv4y_SWLYB-0fJt34cyF', A: '1en8GtBeoZE7_sckROUIPpeSKPJ8cw1D8', S: '1zNNAfMG64qlvfwjOXr1U-8hdsFXoVW8Z' } },
    { id: 'P1-115', level: 'P1', round: 115, date: '2025-06', drive: { T: '1_VCoGCuqcb8f-yrLkMKqPtwbgGdixbO6', A: '1HdjPNJa-wblalq_HBtHr58ksG-WZrMic', S: '1Zp78J3rDlzd6bl4QaKI3qvitfMG0rEF3' } },
    { id: 'P1-116', level: 'P1', round: 116, date: '2025-11', drive: { T: '1yzeyP9TVHgS_-zf676pBPf367g6mov38', A: '1goUB3oVGvA_4U_C22EpgoTA7YpxVcQ2D', S: '1pScKvmt2ESKpi1uCnDHkHyYaDwQWRVoe' } },
    { id: 'P1-117', level: 'P1', round: 117, date: '2026-03', drive: { T: '1iJg0nj9fery2Dr5WaM-j4RrjL8f8hszB', A: '1InuYROmrCkQvBHMFR4FaxFJRn9GyzBDD', S: '1X2_el2E320zfdY-AwfUYUJ-mOOSadOdN' } },
  ],
};
