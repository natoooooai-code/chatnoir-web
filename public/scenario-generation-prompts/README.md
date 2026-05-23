# ChatNoirWeb シナリオ生成プロンプト

このフォルダには、ChatNoirWeb アプリ内で段階実行するためのシナリオ生成用プロンプトを配置します。

元の ChatNoirMemo 側の 1〜4 のプロンプトを土台にしつつ、以下の点だけをアプリ向けに微調整しています。

- ユーザーへの問いかけを UI 側で先に済ませる前提にする
- 途中で「OK」を待つ停止指示を外す
- 手動保存を促す文言を外す
- それ以外の役割、評価観点、出力フォーマットはできるだけ元のまま残す

## 想定プレースホルダ
アプリ側で以下の情報を前置きして送る想定です。

- {{USER_IDEA_TEXT}}: ユーザーが入力した自由文
- {{USER_MEDIA_SUMMARY}}: 画像・動画・音声の要約テキスト
- {{USER_REQUEST_TRANSCRIPT}}: 生成開始までのやり取り全文
- {{PHASE1_PROMPT_TEXT}}: Phase 1 で実際に送ったプロンプト本文
- {{PHASE1_OUTPUT}}: Phase 1 の出力全文
- {{HOOK_APPROVAL_TRANSCRIPT}}: フック確認時のやり取り全文
- {{PHASE2_PROMPT_TEXT}}: Phase 2 で実際に送ったプロンプト本文
- {{PHASE2_OUTPUT}}: Phase 2 の出力全文
- {{PHASE3A_PROMPT_TEXT}}: Phase 3a で実際に送ったプロンプト本文
- {{PHASE3A_OUTPUT}}: Phase 3a の出力全文
- {{PHASE3B_PROMPT_TEXT}}: Phase 3b で実際に送ったプロンプト本文
- {{PHASE3B_OUTPUT}}: Phase 3b の出力全文
- {{USER_REVISION_REQUESTS}}: レビュー後にユーザーが追加で出した修正要望

## 方針
- 既存プロンプトを置き換えるのではなく、public から読み込むアプリ専用版として分離する
- まずは文面の差し替えだけに留め、実際の構造化出力や JSON 化はアプリ側実装時に必要最小限で検討する
