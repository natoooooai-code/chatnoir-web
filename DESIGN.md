# DESIGN.md — Chat;Noir

> このファイルはAIエージェントが Chat;Noir のUIを正確に生成・修正するためのデザイン仕様書です。
> 実装済みの CSS（globals.css, page.module.css, page.tsx 内動的スタイル）に基づく実測値です。

---

## 1. Visual Theme & Atmosphere

- **デザイン方針**: 小説の紙面を模した、没入感重視の読み物インターフェース。ミステリーTRPGの「ゲームマスターが物語を紡ぐ空間」を表現する
- **密度**: ゆったりとした余白。テキスト中心で、装飾は最小限に抑えた文学的UI
- **キーワード**: ノワール、文学的、没入感、ミニマル、小説風、ダーク
- **特徴**:
  - ウェルカム画面は純黒（`#000`）背景にロゴを配置し、映画的な導入を演出
  - ゲーム画面は選択テーマ（ダーク/ライト）に応じて切り替わる
  - チャットエリアにフェードマスク（上端グラデーション）を適用し、スクロール感を演出
  - GlassmorphismをUI要素（入力欄、サイドバー）に使用

---

## 2. Color Palette & Roles

### ライトテーマ（デフォルト）
| Token | Value | 用途 |
|-------|-------|------|
| `--bg-color` | `#fafafa` | ページ背景 |
| `--text-main` | `#111` | 本文テキスト |
| `--text-muted` | `#666` | 補助テキスト、プレイヤーの入力 |
| `--border-color` | `rgba(0,0,0,0.15)` | ボーダー、区切り線 |
| `--sidebar-bg` | `rgba(250,250,250,0.85)` | サイドバー背景（半透明） |
| `--chat-input-bg` | `rgba(255,255,255,0.8)` | チャット入力欄背景 |

### ダークテーマ
| Token | Value | 用途 |
|-------|-------|------|
| `--bg-color` | `#121212` | ページ背景 |
| `--text-main` | `#f0f0f0` | 本文テキスト |
| `--text-muted` | `#aaa` | 補助テキスト |
| `--border-color` | `rgba(255,255,255,0.15)` | ボーダー |
| `--sidebar-bg` | `rgba(25,25,25,0.85)` | サイドバー背景 |
| `--chat-input-bg` | `rgba(30,30,30,0.8)` | チャット入力欄背景 |

### 固定色（テーマ非依存）
| Token | Value | 用途 |
|-------|-------|------|
| `--accent-red` | `#8b0000` | アクセントカラー（ダークレッド） |
| `--accent-glow` | `rgba(139,0,0,0.1)` | アクセントの淡いグロー |
| Welcome背景 | `#000` | ウェルカム画面の純黒背景 |
| SAVES画面背景 | `#0a0a0a` | 管理コンソールの背景 |
| Toast | `rgba(17,17,17,0.9)` + `#fff` | 通知バナー |

---

## 3. Typography Rules

### 3.1 和文フォント
- **明朝体（メイン）**: Shippori Mincho — Google Fonts から読み込み。小説的な雰囲気の要
- **明朝体フォールバック**: Noto Serif JP → Hiragino Mincho ProN（macOS）→ Yu Mincho（Windows）
- **ゴシック体**: Hiragino Sans → Hiragino Kaku Gothic ProN（macOS）→ Noto Sans JP → Meiryo（Windows）
- **丸ゴシック（オプション）**: Klee One (`--font-klee`) — 手書き風の柔らかい書体

### 3.2 欧文フォント
- **サンセリフ**: Inter, Helvetica Neue, Arial
- **等幅**: SFMono-Regular, Consolas, Menlo（コード表示用）

### 3.3 font-family 指定
```css
/* 明朝体（デフォルト・小説テキスト）— CJKフォールバックチェーン */
--font-serif: "Shippori Mincho", "Noto Serif JP", "Hiragino Mincho ProN",
  "Yu Mincho", YuMincho, serif;

/* ゴシック体（UIラベル・設定画面）— 欧文優先+和文フォールバック */
--font-sans: "Inter", "Helvetica Neue", "Hiragino Sans",
  "Hiragino Kaku Gothic ProN", Arial, "Noto Sans JP", Meiryo, sans-serif;

/* 丸ゴシック（オプション） */
--font-klee: "Klee One", cursive;

/* システムUI（ボタン・メニュー） */
--ui-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

**フォールバックの考え方**:
- 本文は明朝体優先。和文（Shippori Mincho）→ 和文フォールバック（Noto Serif JP）→ generic（serif）
- UIは `--ui-font` でシステムフォントを使い、プラットフォームのネイティブ感を維持
- プレイヤーは設定画面からフォントを切り替え可能（serif / sans / klee）

### 3.4 文字サイズ・ウェイト階層

| Role | Font Stack | Size | Weight | Line Height | Letter Spacing | 備考 |
|------|-----------|------|--------|-------------|----------------|------|
| 小説本文 | `--app-font` | `--app-font-size` (可変) | 400 | 2.2 | 1px | チャットエリアのメインテキスト |
| プロローグ見出し (H1) | `--font-serif` | — | 600 | — | — | `# プロローグ` |
| セクション見出し (H2/H3) | `--font-serif` | — | 600 | — | — | Markdown見出し |
| プレイヤー入力 | `--app-font` | `--app-font-size` | 400 | 2.2 | 1px | `--text-muted` 色で表示 |
| サイドバー見出し | `--font-serif` | 0.85rem | 600 | — | 4px | 手帳セクション見出し |
| サイドバー本文 | `--font-serif` | 0.95rem | 400 | 1.8 | — | 手帳の各項目 |
| ボタン | `--ui-font` | 1rem | 500 | — | 2px | 各種ボタン |
| ウェルカムボタン | `--font-serif` | 1rem | bold | — | 8px | トップ画面ボタン |
| 通知案内 | `--font-serif` | 0.9rem | 400 | — | 2px | フェーズ遷移ガイド |

### 3.5 行間・字間
- **小説本文の行間 (line-height)**: `2.2` — 日本語読み物として非常にゆったり。没入感を重視
- **サイドバーの行間**: `1.8`
- **グローバルの行間**: `1.6`（body デフォルト）
- **小説本文の字間 (letter-spacing)**: `1px` — 明朝体の文字間を程よく開ける
- **見出しの字間**: `4px`（サイドバー見出し）/ `8px`（ウェルカムボタン）
- **Markdown本文の段落間**: `margin-bottom: 1rem`

**ガイドライン**:
- 小説テキストの `line-height: 2.2` はChatNoir最大の特徴。noteの2.0よりさらに広く取り、1行ずつゆっくり読ませる
- `letter-spacing: 1px` は明朝体との相性を考慮した値。ゴシック/Kleeの場合は `0.04em` 程度でも良い
- 見出し・ボタンの広い字間（`4px`〜`8px`）は高級感の演出

### 3.6 禁則処理・改行ルール
```css
/* グローバル（bodyに適用済み） */
line-break: strict;           /* 厳格な禁則処理（句読点の行頭禁止等） */
overflow-wrap: break-word;     /* 長いURLや英単語の折り返し */
word-wrap: break-word;         /* レガシーブラウザ互換 */

/* フォントスムージング（bodyに適用済み） */
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;

/* チャットエリアの本文 */
white-space: pre-wrap;         /* プレイヤーの手動改行を保持 */
```

**禁則対象**:
- 行頭禁止: `）」』】〕〉》」】、。，．・：；？！`
- 行末禁止: `（「『【〔〈《「【`

### 3.7 OpenType 機能
```css
/* 見出し (h1, h2, h3) にのみ適用 — noteの実測値に基づく */
font-feature-settings: "palt" 1;
letter-spacing: 0.04em;

/* 本文 (p), body, button, input には適用しない */
font-feature-settings: normal;
```

- **palt**: 和文のプロポーショナル字詰め。**見出し要素にのみ適用**（noteと同方針）
- 本文への `palt` 適用は行わない（可読性への配慮。noteでも見出し専用）
- 見出しの `letter-spacing: 0.04em` は `palt` と組み合わせて使用

### 3.8 縦書き
```css
/* 縦書きモード（設定から切り替え可能） */
writing-mode: vertical-rl;
text-orientation: mixed;
overflow-x: auto;     /* 横スクロールで読み進める */
overflow-y: hidden;
```

- ChatNoirは**縦書きモードに完全対応**
- 縦書き時はスクロール方向が水平（右→左）に変わる
- 入力エリアもレイアウトが縦書き用に調整される

---

## 4. Component Stylings

### Buttons
**ウェルカム画面ボタン（Primary）**
- Background: `#fff`
- Text: `#111`
- Border: `1px solid #fff`
- Padding: `1.2rem 5rem`
- Border Radius: `4px`
- Letter Spacing: `8px`
- Shadow: `0 4px 15px rgba(0,0,0,0.2)`
- Hover: `background: #eee`

**汎用ボタン（.btn）**
- Background: `var(--bg-color)`
- Text: `var(--text-main)`
- Border: `1px solid var(--border-color)`
- Padding: `1.2rem`
- Border Radius: `8px`
- Letter Spacing: `2px`
- Hover: 背景とテキスト色が反転 + `translateY(-1px)`

**送信ボタン（.sendBtn）**
- Background: `transparent`
- Text: `var(--text-main)`
- Border: `1px solid var(--text-main)`
- Padding: `0 3rem`
- Border Radius: `8px`
- Letter Spacing: `4px`
- Hover: 背景とテキスト色が反転
- Disabled: `opacity: 0.2`

### Inputs
**チャット入力欄（.chatInput）**
- Background: `var(--chat-input-bg)` — 半透明
- Border: `1px solid var(--border-color)`
- Padding: `1.2rem 2rem`
- Border Radius: `8px`
- Backdrop Filter: `blur(12px)` — Glassmorphism
- Focus: border が `--text-main` に変化、影が強くなる

### Cards
**ログインカード（.loginCard）**
- Background: `var(--sidebar-bg)`
- Backdrop Filter: `blur(24px)`
- Border: `1px solid var(--border-color)`
- Border Radius: `12px`
- Padding: `4rem 5rem`
- Max Width: `900px`
- Shadow: `0 30px 60px rgba(0,0,0,0.12)`
- Hover: `translateY(-2px)` + 影強化

**セーブデータカード**
- Background: `#161616`
- Border: `1px solid #2a2a2a`
- Border Radius: `6px`
- Width: `280px`
- Shadow: `0 4px 20px rgba(0,0,0,0.5)`

---

## 5. Layout Principles

### Chat Area (メイン小説空間)
- Padding: `4rem 15% 2rem 15%` — 左右15%の空白で「ページの余白」を表現
- 上端にフェードマスク（`mask-image: linear-gradient(...)`）で自然な消え込み
- Background: `transparent`（背景色は親要素から継承）

### Sidebar (手帳)
- Width: `400px`（デフォルト、リサイズ可能）
- Background: `var(--sidebar-bg)` — 半透明 + `blur(15px)`
- Border Left: `1px solid var(--border-color)`
- Padding: `4rem 3rem`
- Z-Index: `5`

### Content Widths
| Area | Width | 用途 |
|------|-------|------|
| ログインカード | max 900px | APIキー入力画面 |
| ブリーフィング | max 800px | シナリオ導入画面 |
| ウェルカムロゴ | max 800px (margin-bottom: 0.5rem) | トップ画面ロゴ |
| セーブカード | 280px | セーブデータ個別カード |
| チャットエリア | 70vw（左右15%余白） | 小説テキスト |
| サイドバー | 400px（可変） | 手帳 |

### Spacing Scale
| Token | Value | 用途 |
|-------|-------|------|
| XS | 0.3rem | リスト項目間 |
| S | 0.8rem | 見出し下、段落間 |
| M | 1.5rem | セクション区切り |
| L | 2.5rem | メッセージ行間 |
| XL | 3rem | セクション間、サイドバー間隔 |
| XXL | 4rem | サイドバー上部パディング |

---

## 6. Depth & Elevation

| Level | Shadow | 用途 |
|-------|--------|------|
| 0 | none | フラットなテキスト、背景 |
| 1 | `0 2px 8px rgba(0,0,0,0.05)` | アバター画像 |
| 2 | `0 4px 12px rgba(0,0,0,0.05)` | 入力欄フォーカス時 |
| 3 | `0 4px 15px rgba(0,0,0,0.08)` | カバー画像、ボタン |
| 4 | `0 30px 60px rgba(0,0,0,0.12)` | ログインカード |
| 5 | `0 4px 20px rgba(0,0,0,0.5)` | セーブカード（ダーク背景上） |

- ライトテーマではソフトな影（`rgba(0,0,0,0.05〜0.12)`）
- ダーク背景上では影が効きにくいため、ボーダー + 微妙な色差で深度を表現

---

## 7. Do's and Don'ts

### Do（推奨）
- 明朝体（Shippori Mincho）を小説テキストのデフォルトにする
- 小説テキストの `line-height` は `2.0` 以上にする（現在 `2.2`）
- ライトテーマのテキスト色は `#111`（純黒ではない）で目の負担を軽減する
- ボタン・ラベルの `letter-spacing` を広め（`2px`〜`8px`）にして高級感を出す
- Glassmorphism（半透明 + blur）をUI要素に適用して奥行きを出す
- CSS Custom Properties でテーマ切り替えを実現する
- アニメーションは控えめにする（`0.3s ease` / `0.4s ease-out`）

### Don't（禁止）
- 純粋な `#000000` をライトテーマのテキストに使わない（眩しすぎる）
- 小説テキストに `line-height: 1.5` 以下を使わない（没入感が損なわれる）
- ゴシック体を小説本文のデフォルトにしない（文学的雰囲気が失われる）
- ウェルカム画面に複雑な装飾を入れない（ロゴ + ボタンのミニマル構成を維持）
- `letter-spacing` を本文テキストで `2px` 以上にしない（読みにくくなる）
- フォントスタック内のフォールバックを省略しない

---

## 8. Responsive Behavior

### Breakpoints
| Name | Width | 説明 |
|------|-------|------|
| Mobile | ≤ 768px | サイドバーはフローティング、チャットパディング縮小 |
| Desktop | > 768px | サイドバーは右側に固定配置 |

### タッチターゲット
- 最小サイズ: 44px × 44px（ボタン、リンク）

### レスポンシブ調整
- モバイル時のチャットパディング: `4rem 8% 2rem 8%`（左右パディングを縮小）
- サイドバー: モバイルではオーバーレイ表示
- フォントサイズ: `--app-font-size` で動的に調整可能（設定画面から）

---

## 9. Agent Prompt Guide

### クイックリファレンス
```
Brand Color: #8b0000 (Dark Red — ノワールのアクセント)
Welcome Background: #000
Text Color (Light): #111
Text Color (Dark): #f0f0f0
Background (Light): #fafafa
Background (Dark): #121212
Serif Font: "Shippori Mincho", "Noto Serif JP", serif
Sans Font: "Inter", "Helvetica Neue", Arial, sans-serif
Novel Body Size: variable (--app-font-size)
Novel Line Height: 2.2
Novel Letter Spacing: 1px
```

### Animations
| Name | Duration | Easing | 用途 |
|------|----------|--------|------|
| fadeIn | 0.4s | ease-out | メッセージの出現 |
| fadeInSlow | 2.5s | ease | ウェルカムボタン |
| writing-pulse | 2s | ease-in-out (infinite) | 「🖋 記述中...」インジケーター |

### プロンプト例
```
Chat;Noir のデザインに従って、新しいUIコンポーネントを作成してください。
- 背景: var(--bg-color)（テーマ対応）
- テキスト: var(--text-main)
- フォント: var(--app-font)（明朝体ベース、ユーザー切替可能）
- 行間: line-height: 2.2（小説テキスト）
- 字間: letter-spacing: 1px（小説テキスト）/ 2-4px（ボタン・見出し）
- ボタン: var(--ui-font)、border-radius: 8px、hover で色反転
- 影: ソフト（rgba(0,0,0,0.05-0.12)）
- 半透明: backdrop-filter: blur(12-24px)
- アニメーション: 0.3s cubic-bezier(0.16, 1, 0.3, 1)
```
