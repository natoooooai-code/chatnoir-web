'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './page.module.css';

// --- SVG Icons ---
const IconImage = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-3px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>;
const IconUser = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-3px' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const IconFile = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-3px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>;
const IconSidebar = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-2px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>;
const IconMessage = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-2px' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;
const IconSearch = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-2px' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const IconBook = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-2px' }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>;
const IconRefresh = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>;

const IDB_STORE = 'chatnoir_saves';
const IDB_KEY = 'auto_save';

async function getIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open('ChatNoirDB', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(key: string, val: any) {
  try {
    const db = await getIDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(val, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error(e); }
}

async function loadFromIDB(key: string): Promise<any> {
  try {
    const db = await getIDB();
    return new Promise<any>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
}

async function getAllIDBSavesMeta(): Promise<{ key: string, coverImage: string, saveName: string }[]> {
  try {
    const db = await getIDB();
    return new Promise<{ key: string, coverImage: string, saveName: string }[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      const metaList: { key: string, coverImage: string, saveName: string }[] = [];
      req.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith('auto_save_')) {
            metaList.push({ key, coverImage: cursor.value.coverImage || '', saveName: cursor.value.saveName || '' });
          }
          cursor.continue();
        } else {
          resolve(metaList);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return []; }
}

async function deleteFromIDB(key: string): Promise<void> {
  try {
    const db = await getIDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error(e); }
}

// 小説風のテキスト整形ユーティリティ（セリフ以外の段落に全角スペースを補完）
const formatNovelText = (text: string, isVertical: boolean) => {
  if (!text) return '';
  let lines = text.replace(/\\n/g, '\n').split('\n');
  lines = lines.map(line => {
    let trimmed = line.trim();
    if (!trimmed) return line;

    // Markdown装飾等は字下げ無視
    if (/^[#\-\*>`]/.test(trimmed) || /^!\[/.test(trimmed) || /^\[/.test(trimmed) || /^\d+\./.test(trimmed)) {
      if (/^#+\s/.test(trimmed)) {
        // 「 - ゲーム概要」「 - 概要」などの不要な接尾辞を削除
        return line.replace(/\s*-\s*(ゲーム概要|概要|設定|プロローグ|物語概要)\s*$/, '');
      }
      return line;
    }

    // 会話や特殊括弧の始まりは字下げしない
    if (/^[「『（(\【]/.test(trimmed)) return line;
    // 既存の **名前**「セリフ」や **名前**（心の声） は字下げしない
    if (/^\*\*[^*]+\*\*[「『（]/.test(trimmed) || /^\*\*[^*]+\*\*$/.test(trimmed)) return line;

    // すでに空白で始まっている場合はそのまま
    if (/^[　\s]/.test(line)) return line;

    return '　' + line;
  });
  let formatted = lines.join('\n');

  if (isVertical) {
    // 半角記号→全角（縦書きで横倒しにならないよう変換）
    formatted = formatted.replace(/!(?!\[)/g, '！').replace(/\?(?!\[)/g, '？');
    // 三点リーダーを縦書き用に変換
    formatted = formatted.replace(/\.{3}/g, '…').replace(/…/g, '︙');
    // ダッシュ（―、—）を縦書き用の罫線（︱: 縦書き用ダッシュ）に変換して中央配置
    formatted = formatted.replace(/[―—]/g, '︱');
    // クォーテーションをダブルミニュート（縦書き対応）に変換
    let count = 0;
    formatted = formatted.replace(/"/g, () => (count++ % 2 === 0 ? '〝' : '〟'));
    // 半角英数字→全角（a-z, A-Z, 0-9）で横倒し防止
    formatted = formatted.replace(/[a-zA-Z0-9]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return String.fromCharCode(code + 0xFEE0);
    });
  }
  return formatted;
};

export default function ChatNoir() {
  const [apiKey, setApiKey] = useState('');

  // ゲームの進行ステータス
  const [gameState, setGameState] = useState<'WELCOME' | 'SAVES' | 'LOGIN' | 'BRIEFING' | 'PLAYING'>('WELCOME');
  const [endingPhase, setEndingPhase] = useState<'NONE' | 'READY_TO_END' | 'FADE_OUT' | 'MENU' | 'REVIEW'>('NONE');
  const [reviewMessages, setReviewMessages] = useState<any[]>([]);
  const [reviewInputText, setReviewInputText] = useState('');

  // ファイルから読み込んだテキストデータを保持するState
  const [gmRuleText, setGmRuleText] = useState('');
  const [scenarioText, setScenarioText] = useState('');
  const [briefingText, setBriefingText] = useState('');
  const [prologueText, setPrologueText] = useState('');
  const [scenarioTitle, setScenarioTitle] = useState('New Scenario');

  // カバー画像
  const [coverImage, setCoverImage] = useState<string>('');

  // トーストUI
  const [toastMsg, setToastMsg] = useState('');
  const [autoSaves, setAutoSaves] = useState<{ key: string, coverImage: string, saveName: string }[]>([]);

  // 選択されたモデル
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');

  // サイドバーの開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [charactersData, setCharactersData] = useState<{ true_name?: string, name: string, gender?: string, info: string, image: string | null, isGenerating: boolean, lastPrompt?: string }[]>([]);
  const [factsData, setFactsData] = useState<string[]>([]);
  const [mysteriesData, setMysteriesData] = useState<string[]>([]);
  const [monologueData, setMonologueData] = useState<string[]>([]);
  const [activeCharacterOptions, setActiveCharacterOptions] = useState<string | null>(null);
  const [playerMemo, setPlayerMemo] = useState<string>('');

  const [openSections, setOpenSections] = useState({ howTo: true, monologue: true, characters: true, facts: true, mysteries: true, memo: true });

  const toggleAllSections = (expand: boolean) => {
    setOpenSections({ howTo: expand, monologue: expand, characters: expand, facts: expand, mysteries: expand, memo: expand });
  };

  // UI設定・サイドバー幅
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'klee'>('serif');
  const [fontSize, setFontSize] = useState<number>(16);
  const [isVertical, setIsVertical] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(380);
  const dragRef = useRef<boolean>(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(450);
  const leftDragRef = useRef<boolean>(false);

  // 設定ファイルからタイトルを自動抽出
  useEffect(() => {
    if (!scenarioText) return;
    const lines = scenarioText.split('\n');
    const titleHeaderIdx = lines.findIndex(l => l.includes('## 1. タイトル'));
    if (titleHeaderIdx !== -1 && lines[titleHeaderIdx + 1]) {
      let extracted = lines[titleHeaderIdx + 1].trim();
      // **タイトル** の形式なら中身だけ取り出す
      const boldMatch = extracted.match(/\*\*(.+)\*\*/);
      if (boldMatch) extracted = boldMatch[1];
      if (extracted) {
        setScenarioTitle(extracted);
      }
    }
  }, [scenarioText]);

  // セッション状態の復元判定
  const [isLoaded, setIsLoaded] = useState(false);
  // 各プレイスルーの一意識別子（同シナリオ複数周回対応）
  const [sessionRunId, setSessionRunId] = useState<string>('');
  // ユーザーが付けるセーブ名
  const [saveName, setSaveName] = useState<string>('');

  // チャットの状態管理
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialScrollDone = useRef(false);

  const insertTags = (prefix: string, suffix: string) => {
    setInputText(prev => prev + prefix + suffix);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const pos = inputRef.current.value.length - suffix.length;
        inputRef.current.setSelectionRange(pos, pos);
      }
    }, 10);
  };

  const resetAllState = () => {
    setMessages([]);
    setCharactersData([]);
    setFactsData([]);
    setMysteriesData([]);
    setMonologueData([]);
    setGmRuleText('');
    setScenarioText('');
    setBriefingText('');
    setPrologueText('');
    setCoverImage('');
    setSaveName('');
    setSessionRunId('');
    setPlayerMemo('');
    setEndingPhase('NONE');
    setReviewMessages([]);
    setReviewInputText('');
    sessionStorage.removeItem('chatnoir-current-save-key');
  };

  const showToast = (message: string) => {
    setToastMsg(message);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const restoreStateData = (parsed: any, targetGameState?: string) => {
    // 明示的な指定があればそれを使用、なければ保存されたもの、それもなければPLAYING
    const nextState = targetGameState || parsed.gameState || 'PLAYING';
    setGameState(nextState as any);
    setMessages(parsed.messages || []);
    setGmRuleText(parsed.gmRuleText || '');
    setScenarioText(parsed.scenarioText || '');
    setBriefingText(parsed.briefingText || '');
    setPrologueText(parsed.prologueText || '');
    setCoverImage(parsed.coverImage || '');
    if (parsed.apiKey) setApiKey(parsed.apiKey); // APIキーは未保存でも消さない
    setCharactersData(parsed.charactersData || []);
    setFactsData(parsed.factsData || []);
    setMysteriesData(parsed.mysteriesData || []);
    setMonologueData(parsed.monologueData ? (Array.isArray(parsed.monologueData) ? parsed.monologueData : [parsed.monologueData]) : []);
    if (parsed.theme) setTheme(parsed.theme);
    setScenarioTitle(parsed.scenarioTitle || 'New Scenario');
    if (parsed.fontFamily) setFontFamily(parsed.fontFamily);
    if (parsed.fontSize) setFontSize(parsed.fontSize);
    if (parsed.isVertical !== undefined) setIsVertical(parsed.isVertical);
    if (parsed.sidebarWidth) setSidebarWidth(parsed.sidebarWidth);
    if (parsed.leftSidebarWidth) setLeftSidebarWidth(parsed.leftSidebarWidth);
    setIsSidebarOpen(parsed.isSidebarOpen !== undefined ? parsed.isSidebarOpen : true);
    setSessionRunId(parsed.sessionRunId || '');
    setSaveName(parsed.saveName || '');
    setPlayerMemo(parsed.playerMemo || '');
    setEndingPhase(parsed.endingPhase || 'NONE');
    setReviewMessages(parsed.reviewMessages || []);

    // 復元後、DOMのレンダリングを待ってから最新メッセージへスクロール
    setTimeout(() => scrollToBottom(), 150);
  };

  // GameStateをsessionStorageへ保存（リロード時のUI状態維持）
  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem('chatnoir-current-gameState', gameState);
    }
  }, [gameState, isLoaded]);

  // マウント時に保存されたキー・オートセーブを読み込む
  useEffect(() => {
    const saved = localStorage.getItem('chatnoir_apiKey');
    if (saved) setApiKey(saved);

    const runStartupInfo = async () => {
      // sessionStorageから前回の状態を読み込む（リロード用）
      const currentKey = sessionStorage.getItem('chatnoir-current-save-key');
      const isReload = !!currentKey;

      // まず全オートセーブのメタデータを読み込んでおく（SAVES画面用）
      const metas = await getAllIDBSavesMeta();
      setAutoSaves(metas);

      const savedGameState = sessionStorage.getItem('chatnoir-current-gameState');

      if (isReload) {
        const autoSavedData = await loadFromIDB(currentKey as string);
        if (autoSavedData) {
          // リロード時は保存されているデータと状態を復元
          restoreStateData(autoSavedData, savedGameState || autoSavedData.gameState);
          showToast('セッションから復帰しました');
        } else if (savedGameState) {
          setGameState(savedGameState as any);
        }
      } else if (savedGameState) {
        // ゲーム中ではないが、SAVES画面やLOGIN画面を開いていた場合はその状態を復元
        setGameState(savedGameState as any);
      }
      setIsLoaded(true);
    };
    runStartupInfo();
  }, []);

  // SAVES画面を開くたびに最新のセーブデータを再取得する
  useEffect(() => {
    if (isLoaded && gameState === 'SAVES') {
      getAllIDBSavesMeta().then(metas => setAutoSaves(metas));
    }
  }, [gameState, isLoaded]);

  // 常にバックアップ (IndexedDB)
  useEffect(() => {
    // 復元が終わる前に上書き保存されるのを防ぐため、isLoadedチェック
    if (isLoaded && gameState !== 'WELCOME' && gameState !== 'SAVES' && gameState !== 'LOGIN') {
      const currentData = {
        gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, coverImage, apiKey,
        charactersData, factsData, mysteriesData, monologueData, playerMemo, theme, fontFamily, fontSize, isVertical, sidebarWidth, leftSidebarWidth, isSidebarOpen, sessionRunId, saveName, scenarioTitle, endingPhase, reviewMessages
      };

      const fileNameTitle = scenarioTitle.trim().replace(/[\/\\?%*:|"<>]/g, '_');
      // sessionRunIdが空（新規開始前）、またはタイトルが設定されていない場合はセーブしない
      if (!sessionRunId || !fileNameTitle) return;

      const runKey = `auto_save_${fileNameTitle}_${sessionRunId}`;
      sessionStorage.setItem('chatnoir-current-save-key', runKey);
      saveToIDB(runKey, currentData);
    }
  }, [isLoaded, gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, coverImage, apiKey, charactersData, factsData, mysteriesData, monologueData, playerMemo, theme, fontFamily, fontSize, isVertical, sidebarWidth, leftSidebarWidth, isSidebarOpen, sessionRunId, saveName, scenarioTitle, endingPhase, reviewMessages]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      if (isVertical) {
        // 縦書きモードでは、内容が増えるごとに左方向へサイズが伸びるため、左端を基準にする
        scrollRef.current.scrollLeft = -scrollRef.current.scrollWidth;
      } else {
        // 通常（横書き）モード
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  };

  const scrollToTop = () => {
    if (scrollRef.current) {
      if (isVertical) {
        scrollRef.current.scrollLeft = 0;
      } else {
        scrollRef.current.scrollTop = 0;
      }
    }
  };

  // サイドバーのリサイズ処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < 800) setSidebarWidth(newWidth);
      }
      if (leftDragRef.current) {
        const newWidth = e.clientX;
        if (newWidth > 250 && newWidth < 800) setLeftSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      if (dragRef.current || leftDragRef.current) {
        dragRef.current = false;
        leftDragRef.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto'; // Re-enable text selection after drag
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // スクロール処理（自動スクロールを停止し、プレイヤーが自分のペースで読めるようにする）
  useEffect(() => {
    // 初回ロード時のみ、最新メッセージまでスクロールする
    if (isLoaded && gameState === 'PLAYING' && !isInitialScrollDone.current && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
        isInitialScrollDone.current = true;
      }, 500); // レンダリング完了まで余裕を持つ
    }
  }, [isLoaded, gameState, messages.length]);

  // ホイールスクロールの縦書き変換処理
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isVertical || gameState !== 'PLAYING') return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        // vertical-rlではscrollLeftを引くと左（古い方から新しい方）へ進む
        el.scrollLeft -= e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isVertical, gameState]);

  // 画像ファイルの読み込み関数
  const handleImageRead = (e: React.ChangeEvent<HTMLInputElement>, setter: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setter(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // ローカルファイルの読み込み関数
  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>, setter: (text: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setter(evt.target?.result as string);
    };
    reader.readAsText(file);
  };

  // 複数ファイルを一括読み込みして名前で自動振り分け
  const handleMultiFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const name = file.name.toLowerCase();

      // 画像がドロップされたらカバー画像（パッケージ）としてセット
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          setCoverImage(evt.target?.result as string);
        };
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (name.includes('setting') || name.includes('設定')) {
          setScenarioText(text);
        } else if (name.includes('prologue') || name.includes('プロローグ')) {
          setPrologueText(text);
        } else if (name.includes('briefing') || name.includes('概要')) {
          setBriefingText(text);
        } else if (name.includes('gm') || name.includes('ルール')) {
          setGmRuleText(text);
        }
      };
      reader.readAsText(file);
    });
    // 入力値をリセットして、同じファイル名の再選択を可能にする
    e.target.value = '';
  };

  // サンプルシナリオをサーバーから自動ロード
  const loadDefaultScenario = async () => {
    try {
      const [rGM, rScen, rBrief, rPrologue] = await Promise.all([
        fetch('/scenarios/GMルール.md').then(r => r.text()),
        fetch('/scenarios/歯車_設定.md').then(r => r.text()),
        fetch('/scenarios/歯車_概要.md').then(r => r.text()),
        fetch('/scenarios/歯車_プロローグ.md').then(r => r.text()),
      ]);
      setGmRuleText(rGM);
      setScenarioText(rScen);
      setBriefingText(rBrief);
      setCoverImage('/package.png');
      setPrologueText(rPrologue.trim());
    } catch (e) {
      alert('サンプルシナリオの読み込みに失敗しました。');
    }
  };

  const handleStartLogin = () => {
    if (apiKey.trim() === '' || !gmRuleText || !scenarioText || !prologueText || !briefingText) {
      alert("必須項目（APIキー、GMルール、設定ファイル、プロローグ、概要ファイル）をすべてセットしてください！");
      return;
    }
    if (!saveName.trim()) {
      alert("プロジェクト名を入力してください（セーブスロットの識別に必要です）");
      return;
    }
    localStorage.setItem('chatnoir_apiKey', apiKey.trim());
    // 新規ゲーム開始時に前回の派生データをクリア
    setMessages([]);
    setCharactersData([]);
    setFactsData([]);
    setMysteriesData([]);
    setMonologueData([]);
    // 新しいセッションIDを発行（同じシナリオでも別スロットに保存される）
    const newId = Date.now().toString(36);
    setSessionRunId(newId);

    // いきなりゲームを開始せず、まずはブリーフィング画面へ進む
    setGameState('BRIEFING');
    
    // 画面遷移時に一番上（先頭）が表示されるようにスクロール位置をリセット（DOM更新後に行うためsetTimeout）
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        scrollRef.current.scrollLeft = 0;
      }
    }, 100);
  };

  // ブリーフィング画面で「物語を始める」を押した時の処理（プロローグだけ表示）
  const startInitialChat = () => {
    setGameState('PLAYING');
    
    // 初回起動時の強制一番下スクロール（useEffect）が誤ってはたらくのを防ぐフラグ
    isInitialScrollDone.current = true;

    // ページの先頭にスクロールをリセット（DOM更新後に行うためsetTimeout）
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        scrollRef.current.scrollLeft = 0;
      }
    }, 200);

    const outText = prologueText ? prologueText : "（※プロローグファイルが読み込まれていません。行動を入力して開始してください）";

    // プロローグをチャット履歴に配置（AIの最初の発言として）
    const initialHistory = [
      { role: 'user', parts: [{ text: "（システム起動：ゲーム開始。プロローグが読み込まれました）" }] },
      { role: 'model', parts: [{ text: "# プロローグ\n\n" + outText }] },
    ];

    setMessages(initialHistory);
    // この時点ではAIへの通信は行わない。プレイヤーがプロローグを読み終えるのを待つ。
  };

  // プレイヤーがプロローグを読み終え、「物語に入る」を押した時の処理
  const startPhase2 = async () => {
    setIsLoading(true);

    // メインゲーム開始のシステム通知を履歴に追加
    const phase2History = [
      ...messages,
      { role: 'user', parts: [{ text: "（システム通知：メインゲーム（本編）を開始してください。上記のプロローグは事前に用意されたテキストであり、GMルールの書式に従っていない場合があります。ここから先のあなたの出力では、GMルールに厳密に従ってください。NPCの発言には必ず **名前**「セリフ」 の形式を使用すること。プロローグの状況を引き継ぎ、最初のシーンの描写を一人称視点で行い、プレイヤーの行動を待つ形で終了してください）" }] },
    ];

    setMessages(phase2History);

    // AIにフェーズ2の最初の描写を生成させる
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey,
          model: selectedModel,
          messages: phase2History,
          systemInstruction: gmRuleText + "\n\n" + scenarioText
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessages([...phase2History, { role: 'model', parts: [{ text: data.text }] }]);
      } else {
        let errorStr = 'Unknown Error';
        if (data.error) {
          errorStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
          // もし文字列の中にさらにJSONが含まれている場合はパースを試みる
          try {
            const nested = JSON.parse(errorStr);
            if (nested.error?.message) errorStr = nested.error.message;
            else if (nested.message) errorStr = nested.message;
          } catch (e) { /* ignore */ }
        }

        const isOverloaded = errorStr.includes('503') || errorStr.toLowerCase().includes('demand') || errorStr.includes('UNAVAILABLE');
        const displayMsg = isOverloaded
          ? "【サーバー混雑】AIが一時的に利用できません。1分ほど待ってから再度「物語に入る」を押してください。"
          : `エラーが発生しました: ${errorStr}`;

        showToast(displayMsg);
        // 開発時のエラーオーバーレイ表示を避けるため、想定内のAPIエラーはconsole.warnに留める
        console.warn(`${displayMsg} (API Response: ${errorStr})`);
        // メッセージ履歴をプロローグ後に戻す（以前の状態を保持していた messages を使用）
        setMessages(messages);
      }
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      if (!isAbort) {
        showToast("通信エラーが発生しました。ネットワーク設定を確認してください。");
        console.warn("フェーズ2開始通信エラー:", err.message || err);
        setMessages(messages);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- 特殊コマンド（JSON抽出） ---
  const requestSpecialCommand = async (commandType: 'characters' | 'facts' | 'mysteries' | 'monologue', overrideMessages?: any[]) => {
    if (isLoading) return;
    setIsLoading(true);

    // UI（小説空間）には出さず、APIの裏側で送るメッセージ
    let triggerText = '';
    if (commandType === 'characters') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。このシナリオの主人公（プレイヤー自身）と、ここまでに登場した人物の基本情報を以下のJSON形式のみで出力せよ。※システムプロンプトの「設定ファイル」にある裏設定や真相を先回りして書くことは【重大なルール違反】です。必ず【これまでのチャット履歴で主人公が実際に知り得た情報のみ】で構成すること。\n```json\n{\n  \"characters\": [\n    { \"true_name\": \"本当の名前(一貫したIDとして使用)\", \"is_name_known_to_player\": trueかfalse(劇中で名前が判明しているか), \"name\": \"trueなら本名を、falseなら『黒服の男』などの外見的特徴を出力\", \"gender\": \"male または female または unknown\", \"info\": \"現在主人公が知っている範囲での印象や基本設定\" }\n  ]\n}\n```）";
    } else if (commandType === 'facts') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。現在主人公が把握している確定的な事実を以下のJSON形式のみで出力せよ。※「設定ファイル」に記載されている真相や裏設定は絶対に反映させず、必ず【これまでのチャット履歴で主人公が実際に体験・確認した事実のみ】を抽出すること。先回りしたネタバレ記述は厳禁。\n```json\n{\n  \"facts\": [\"事実1\", \"事実2\"]\n}\n```）";
    } else if (commandType === 'mysteries') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。現在主人公がまだ解決できていない未解決の謎（解くべき課題）を以下のJSON形式のみで出力せよ。※「設定ファイル」にある真相を先回りして謎の形式で提示（例：主人公がまだ知らないトリックの核心を疑問形にする等）することは【重大な違反（ネタバレ）】です。必ず【これまでのチャット履歴のみ】から、今の主人公が純粋に不思議に思っている事だけを抽出すること。\n```json\n{\n  \"mysteries\": [\"謎1\", \"謎2\"]\n}\n```）";
    } else if (commandType === 'monologue') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。これまでの展開を踏まえ、現在の主人公の心境や整理すべき思考を小説の独白形式で出力せよ。※「設定ファイル」の真相に引張られて、主人公が知り得ないメタ的な推論をさせないこと。必ずチャット履歴の範囲内での主観視点で記述すること。\n```json\n{\n  \"monologue\": \"主人公の内心の独白...\"\n}\n```）";
    }

    // GMルールから削った「システムコマンドはルールを無視してJSONのみ返せ」という厳格な指示を、この瞬間の最後尾だけに動的に結合させる
    triggerText += "\n\n※重要：これはシステムコマンドです。他のルール(情景描写、一人称、ステータス表示など)をすべて無視し、要求されたJSON形式のデータのみを純粋に出力してください。余計な挨拶や地の文は一切不要です。（アプリの手帳更新に必須なルールです）";

    // チャット履歴を維持したまま、最後に一時的なコマンドを足して通信する
    const activeMessages = overrideMessages || messages;
    const apiMessages = [...activeMessages, { role: 'user', parts: [{ text: triggerText }] }];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey,
          model: selectedModel,
          messages: apiMessages,
          systemInstruction: gmRuleText + "\n\n" + scenarioText
        })
      });
      const data = await res.json();
      if (res.ok) {
        // 返ってきた文字列からJSONだけを強引に抽出
        let jsonStr = data.text;
        const startIndex = jsonStr.indexOf('{');
        const endIndex = jsonStr.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
          jsonStr = jsonStr.substring(startIndex, endIndex + 1);
          const parsed = JSON.parse(jsonStr);

          // データをサイドバー用の状態変数にセット
          if (commandType === 'characters' && parsed.characters) {
            setCharactersData(prev => {
              const updated = [...prev];
              parsed.characters.forEach((c: any) => {
                // true_nameが一致するか、またはnameが一致するかで同一人物を判定
                const idx = updated.findIndex(old => 
                  (old.true_name && c.true_name && old.true_name === c.true_name) || old.name === c.name
                );
                if (idx !== -1) {
                  // すでに存在する人物は情報をマージ（画像等は維持）
                  updated[idx] = { ...updated[idx], ...c, isGenerating: false };
                } else {
                  // 新しい人物はリストの末尾に追加
                  updated.push({ ...c, image: null, isGenerating: false });
                }
              });
              return updated;
            });
            showToast("人物情報を更新しました");
          } else if (commandType === 'facts' && parsed.facts) {
            setFactsData(parsed.facts);
            showToast("事実情報を更新しました");
          } else if (commandType === 'mysteries' && parsed.mysteries) {
            setMysteriesData(parsed.mysteries);
            showToast("謎情報を更新しました");
          } else if (commandType === 'monologue' && parsed.monologue) {
            setMonologueData(prev => [...prev, parsed.monologue]);
            showToast("モノローグを更新しました");
          }
        } else {
          console.error("JSON形式ではありませんでした:", data.text);
          // サーバー（コマンドプロンプト）にエラーを飛ばす
          fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.text, type: 'JSON_ERROR', command: commandType })
          }).catch(() => { });
        }
      }
    } catch (err) {
      console.error("コマンド実行失敗:", err);
      const isOverloaded = err instanceof Error && (err.message.includes('503') || err.message.includes('demand') || err.message.includes('UNAVAILABLE'));
      const msg = isOverloaded
        ? "【お知らせ】現在AIが非常に混み合っており、情報の更新に失敗しました。少し時間をおいてから、再度「更新」ボタンを押してみてください。"
        : "情報の取得・解析に失敗しました。一時的な通信エラーの可能性があります。";
      alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePrompt = async (characterName: string) => {
    setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, isGenerating: true } : old));
    try {
      const res = await fetch('/api/generate_avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey,
          characterName: characterName,
          systemInstruction: gmRuleText + "\n\n" + scenarioText,
          messages: messages // 会話の文脈を追加
        })
      });
      const data = await res.json();
      if (res.ok && data.prompt) {
        try {
          await navigator.clipboard.writeText(data.prompt);
          showToast("プロンプトをクリップボードにコピーしました！");
        } catch (e) {
          alert("プロンプト:\n" + data.prompt);
        }
        setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, isGenerating: false, lastPrompt: data.prompt } : old));
      } else {
        setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, isGenerating: false } : old));
        alert("生成に失敗しました: " + (data.error || '不明なエラー'));
      }
    } catch (e) {
      setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, isGenerating: false } : old));
      alert("通信エラーが発生しました");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, characterName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, image: base64 } : old));
        showToast(`${characterName}の画像を設定しました`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteImage = (characterName: string) => {
    setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, image: null } : old));
    showToast(`${characterName}の画像を削除しました`);
  };

  // --- セーブ・ロード機能 ---
  const handleDownloadPlayLog = () => {
    let logText = `# ${scenarioTitle} - プレイログ\n\n`;
    messages.forEach((msg, index) => {
      // システム起動メッセージとメインゲーム開始指示は除外
      if (index === 0 || index === 2) return;
      if (!msg.parts?.[0]?.text) return;
      
      logText += `${msg.parts[0].text}\n\n---\n\n`;
    });
    
    const blob = new Blob([logText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const now = new Date();
    const datePart = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0');
    const fileNameTitle = scenarioTitle.trim().replace(/[\/\\?%*:|"<>]/g, '_');
    
    a.download = `プレイログ_${fileNameTitle}_${datePart}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('プレイログをテキスト出力しました');
  };
  const handleSaveData = () => {
    try {
      const saveData = {
        gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, coverImage, apiKey,
        charactersData, factsData, mysteriesData, monologueData, theme, fontFamily, fontSize, isVertical, sidebarWidth, isSidebarOpen, scenarioTitle, endingPhase, reviewMessages
      };

      const fileNameTitle = scenarioTitle.trim().replace(/[\/\\?%*:|"<>]/g, '_');
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const datePart = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0');
      const timePart = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      a.download = `${fileNameTitle}_${datePart}_${timePart}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('セーブデータをダウンロード保存しました');
      setShowSettings(false);
    } catch (e: any) {
      alert("セーブに失敗しました");
    }
  };

  const handleLoadData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        restoreStateData(parsed);
        showToast('セーブデータを復元しました');
        setShowSettings(false);
      } catch (err) {
        alert("ロードに失敗しました。ファイル形式が不正です。");
      }
    };
    input.click();
  };

  const handleAutoSaveLoad = async (key: string) => {
    const data = await loadFromIDB(key);
    if (data) {
      sessionStorage.setItem('chatnoir-current-save-key', key);
      restoreStateData(data);
      showToast('オートセーブデータから復帰しました');
    }
  };

  const handleDeleteSave = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`「${key.replace('auto_save_', '')}」のセーブデータを削除しますか？`)) {
      await deleteFromIDB(key);
      setAutoSaves(metas => metas.filter(m => m.key !== key));
      showToast('セーブデータを削除しました');
      if (sessionStorage.getItem('chatnoir-current-save-key') === key) {
        sessionStorage.removeItem('chatnoir-current-save-key');
      }
    }
  };

  // キャンセル用コントローラー
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- 通常の行動入力 ---
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const newUserMsg = { role: 'user', parts: [{ text: inputText }] };
    const newHistory = [...messages, newUserMsg];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);
    // 自分が送信した直後だけは一番下（最新の自分の入力）までスクロールさせる
    setTimeout(() => scrollToBottom(), 100);

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          apiKey: apiKey,
          model: selectedModel,
          messages: newHistory,
          systemInstruction: gmRuleText + "\n\n" + scenarioText
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessages([...newHistory, { role: 'model', parts: [{ text: data.text }] }]);
        // エンディング判定：AIのレスポンスに【終】が含まれていたらエンディング待機状態へ
        if (data.text.includes('【終】') && endingPhase === 'NONE') {
          setEndingPhase('READY_TO_END');
        }
      } else {
        const errorStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        const isOverloaded = errorStr.includes('503') || errorStr.includes('demand') || errorStr.includes('UNAVAILABLE');
        const msg = isOverloaded
          ? "【ご案内】現在、AIサーバーが一時的に非常に混み合っています。自動リトライを行いましたが解決しませんでした。数十秒ほど待ってから、もう一度送信してみてください。"
          : "エラーが発生しました: " + errorStr;
        alert(msg);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("出力が中断されました");
      } else {
        console.error(err);
        alert("通信に失敗しました。");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const sendReviewMessage = async (initialPrompt?: string) => {
    const prompt = initialPrompt || reviewInputText;
    if (!prompt.trim() || isLoading) return;

    // 初回のみ本編履歴をベースにする
    const baseHistory = reviewMessages.length > 0 ? reviewMessages : messages;
    const isInitial = !!initialPrompt;
    const newHistory = [...baseHistory, { role: 'user', parts: [{ text: prompt }], isHidden: isInitial }];
    setReviewMessages(newHistory);
    setReviewInputText('');
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    const REVIEW_SYSTEM_PROMPT = `
【重要】ここからは本編クリア後の感想戦（ネタバレありのメタ会話）です。
あなたは、この物語の全てを知るGM「ロア」として、プレイヤーの旅を振り返ります。以下の手順に従って解説と感想を行ってください。

1. まず、設定ファイルに記述されていた**物語の全ての真相**と、**核心となる謎（セントラル・クエスチョン）に対する最終的な答え**を、分かりやすくプレイヤーに開示してください。
2. 次に、プレイヤーがゲーム中に下した**重要な選択**をいくつかピックアップし、その選択が他の登場人物の感情や物語の分岐に**どのように影響したか**を具体的に解説してください。（例：「あの場面で彼に正直に話したことで、彼の信頼度が大幅に上昇し、通常では得られない情報を得ることができました」）
3. プレイヤーが**見逃してしまった可能性のある重要な伏線や情報**について、その本来の意味と、どこで発見できた可能性があったかを解説してください。
4. 各登場人物（特にプレイヤーが深く関わった人物）の、プレイヤーが知り得なかった**最終的な内面や秘密**について語り、彼らの物語を補完してください。
5. 最後に、GM「ロア」個人の視点から、プレイヤーの旅路全体に対する感想や称賛の言葉を述べてください。
6. 全ての解説と感想の締めくくりとして、必ず以下の言葉を出力してください：
「もし、この物語について何か他に聞きたいことがあれば、何でも質問してください。」
`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          apiKey: apiKey,
          model: selectedModel,
          messages: newHistory,
          isReviewMode: true,
          systemInstruction: gmRuleText + "\n\n" + scenarioText + "\n\n" + REVIEW_SYSTEM_PROMPT
        })
      });
      const data = await res.json();
      if (res.ok) {
        setReviewMessages([...newHistory, { role: 'model', parts: [{ text: data.text }] }]);
      } else {
        const errorStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        alert("エラーが発生しました: " + errorStr);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        alert("通信に失敗しました。");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      showToast('AIの出力を停止しました');
    }
  };

  // --- ゲーム画面の描画最適化（入力毎の再レンダリング防止） ---
  const renderedMessages = useMemo(() => {
    return messages.map((msg, index) => {
      // システム起動メッセージ(0)とメインゲーム開始指示(2)は非表示
      if (index === 0 || index === 2) return null;

      return (
        <div
          key={index}
          className={`fade-in ${styles.messageRow}`}
        >
          {msg.role === 'user' && <span style={{ color: 'var(--text-muted)' }}>＞ </span>}
          <div
            className={styles.messageContent + " markdown-body"}
            style={{
              color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--text-main)',
              fontStyle: 'normal',
              whiteSpace: 'pre-wrap'
            }}
          >
            <ReactMarkdown
              components={{
                p: ({ children }) => {
                  // 文字列「【終】」のみの段落を特定
                  const isEnd = Array.isArray(children)
                    ? (children.length === 1 && children[0] === '【終】')
                    : children === '【終】';

                  return <p className={isEnd ? 'end-mark' : ''}>{children}</p>;
                }
              }}
            >
              {formatNovelText(msg.parts[0].text, isVertical)}
            </ReactMarkdown>
          </div>
        </div>
      );
    });
  }, [messages, isVertical]);

  if (gameState === 'WELCOME') {
    return (
      <div className={`${styles.welcomeContainer} fade-in`}>
        <img src="/logo_yoko.png" alt="ChatNoir" className={styles.welcomeLogo} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button className={styles.welcomeBtn} onClick={() => { resetAllState(); setGameState('LOGIN'); }}>
            新しく入室する
          </button>

          {autoSaves.length > 0 && (
            <button className={styles.welcomeBtn} onClick={() => setGameState('SAVES')} style={{ background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', fontSize: '0.9rem', padding: '0.8rem 2rem' }}>
              続きから遊ぶ
            </button>
          )}

          <button className={styles.welcomeBtn} onClick={handleLoadData} style={{ background: 'transparent', color: '#666', border: '1px solid #ccc', fontSize: '0.8rem', padding: '0.6rem 2rem' }}>
            ファイルからロード
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'SAVES') {
    return (
      <div className="fade-in" style={{ minHeight: '100vh', width: '100vw', background: '#0a0a0a', color: '#fff', padding: '3rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '4px', display: 'flex', alignItems: 'center', gap: '12px', color: '#e0e0e0' }}>
              シナリオ一覧
            </h2>
            <button onClick={() => setGameState('WELCOME')} style={{ background: '#1a1a1a', color: '#ccc', border: '1px solid #333', padding: '0.6rem 1.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '1px', transition: 'all 0.2s' }}>
              トップ画面へ戻る
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', width: '100%', marginTop: '1rem' }}>
            {autoSaves.map(meta => (
              <div key={meta.key} style={{ display: 'flex', flexDirection: 'column', width: '280px', background: '#161616', border: '1px solid #2a2a2a', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                <div
                  onClick={() => handleAutoSaveLoad(meta.key)}
                  style={{ width: '100%', height: '160px', background: meta.coverImage ? `url(${meta.coverImage}) center/cover` : '#222', cursor: 'pointer', position: 'relative' }}
                >
                  {!meta.coverImage && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '0.8rem', letterSpacing: '2px' }}>NO IMAGE</div>}
                </div>
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '1px', cursor: 'pointer' }}
                    title="クリックして名前を変更"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const currentName = meta.saveName || meta.key.replace('auto_save_', '').replace(/_[a-z0-9]+$/, '');
                      const newName = prompt('セーブデータの名前を入力してください：', currentName);
                      if (newName && newName.trim()) {
                        const data = await loadFromIDB(meta.key);
                        if (data) {
                          data.saveName = newName.trim();
                          await saveToIDB(meta.key, data);
                          setAutoSaves(prev => prev.map(m => m.key === meta.key ? { ...m, saveName: newName.trim() } : m));
                        }
                      }
                    }}
                  >
                    {meta.saveName || meta.key.replace('auto_save_', '').replace(/_[a-z0-9]+$/, '')}
                  </div>
                  {meta.saveName && (
                    <div style={{ color: '#777', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meta.key.replace('auto_save_', '').replace(/_[a-z0-9]+$/, '')}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <button onClick={() => handleAutoSaveLoad(meta.key)} style={{ flex: 1, background: '#e0e0e0', color: '#000', border: 'none', padding: '6px 0', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', marginRight: '8px' }}>プレイ再開</button>
                    <button onClick={(e) => handleDeleteSave(meta.key, e)} style={{ background: 'transparent', color: '#ff4444', border: '1px solid rgba(255,68,68,0.4)', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>削除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {autoSaves.length === 0 && (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#555', letterSpacing: '2px' }}>
              現在保存されているシナリオはありません
            </div>
          )}

        </div>
      </div>
    );
  }

  // --- APIキー入力・ファイルアップロード画面 ---
  if (gameState === 'LOGIN') {
    const dynamicStyles = `
      :root {
        --bg-color: ${theme === 'dark' ? '#121212' : '#fafafa'};
        --text-main: ${theme === 'dark' ? '#f0f0f0' : '#111'};
        --text-muted: ${theme === 'dark' ? '#aaa' : '#666'};
        --border-color: ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
        --sidebar-bg: ${theme === 'dark' ? 'rgba(25, 25, 25, 0.85)' : 'rgba(250, 250, 250, 0.85)'};
        --chat-input-bg: ${theme === 'dark' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
        --app-font: ${fontFamily === 'serif' ? 'var(--font-serif)' : fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-klee)'};
        --app-font-size: ${fontSize}px;
        --ui-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      body {
        background-color: var(--bg-color);
        color: var(--text-main);
        font-family: var(--app-font);
      }
      .markdown-body {
        font-family: var(--app-font) !important;
        font-size: var(--app-font-size) !important;
        color: var(--text-main) !important;
      }
      .markdown-body strong {
        color: ${theme === 'dark' ? '#fff' : '#000'} !important;
      }
    `;

    return (
      <div className={styles.container}>
        <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
        <div className={`${styles.loginCard} fade-in`}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setGameState('WELCOME')}
              style={{ background: '#1a1a1a', color: '#ccc', border: '1px solid #333', padding: '0.6rem 1.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '1px', transition: 'all 0.2s' }}
            >
              トップ画面へ戻る
            </button>
          </div>
          <div style={{ width: '100%', marginBottom: '1.5rem', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {coverImage ? (
              <img src={coverImage} alt="Cover" style={{ width: '100%', height: 'auto', maxHeight: '450px', objectFit: 'cover', display: 'block' }} />
            ) : (
              <img src="/logo.png" alt="Chat;Noir" style={{ width: '100%', height: 'auto', maxHeight: '450px', objectFit: 'contain', display: 'block', padding: '2rem' }} />
            )}
          </div>
          {scenarioTitle && scenarioText && (
            <h1 style={{ fontSize: '1.8rem', color: 'var(--text-main)', margin: '1rem 0 0.5rem 0', fontFamily: 'var(--font-serif)', letterSpacing: '4px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
              {scenarioTitle}
            </h1>
          )}
          <p className={styles.subtitle}>
            {scenarioText ? 'シナリオの準備ができました' : 'シナリオファイルをアップロードして遊ぶ'}
          </p>
          <div className={styles.inputWrapper}>
            <input
              type="password"
              className={styles.input}
              placeholder="Google AI Studio API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.5)', color: '#111', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '2px', fontFamily: 'inherit' }}
            >
              <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (推奨)</option>
              <option value="gemini-3.0-flash-preview">Gemini 3.1 Flash</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="gemma-4-31b-it">Gemma 4 31B</option>
            </select>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block', letterSpacing: '1px' }}>プロジェクト名（必須）</label>
              <input
                type="text"
                className={styles.input}
                placeholder="例：1周目、Aルート、2024プレイ等"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>


            <button
              onClick={loadDefaultScenario}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.8rem', background: 'transparent', color: '#111', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '2px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s', fontFamily: 'var(--font-serif)', letterSpacing: '2px' }}
            >
              <IconBook /> サンプルシナリオで遊ぶ
            </button>

            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.03)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', marginTop: '1rem', marginBottom: '2rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', fontWeight: 'bold', letterSpacing: '1px' }}>
                ファイルを一括選択
              </p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                設定ファイル・概要・プロローグ・ルール・画像を<br />まとめて選択して一気に準備できます。
              </p>
              <input type="file" multiple accept=".md,.txt,image/*" onChange={handleMultiFileRead} style={{ color: '#111', fontSize: '0.8rem', width: '100%', cursor: 'pointer', padding: '0.8rem', background: '#fff', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>

            <div style={{ position: 'relative', textAlign: 'center', margin: '2rem 0' }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--border-color)', zIndex: 1 }}></div>
              <span style={{ position: 'relative', zIndex: 2, background: 'var(--sidebar-bg)', padding: '0 1rem', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                または、個別に細かく設定
              </span>
            </div>
            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconImage /> パッケージ画像
                {coverImage && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => setCoverImage(evt.target?.result as string);
                  reader.readAsDataURL(file);
                }
                e.target.value = '';
              }} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> GMルール
                {gmRuleText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setGmRuleText)} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> 設定ファイル
                {scenarioText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setScenarioText)} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> 概要ファイル
                {briefingText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setBriefingText)} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> プロローグ
                {prologueText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setPrologueText)} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
            </div>

            <button
              className={styles.btn}
              onClick={handleStartLogin}
              style={{ opacity: (!apiKey || !gmRuleText || !scenarioText || !prologueText || !briefingText) ? 0.5 : 1 }}
            >
              物語の準備へ
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- ゲーム画面（プレイング 兼 ブリーフィング） ---
  return (
    <div className={styles.gameLayout}>
      <style dangerouslySetInnerHTML={{
        __html: `
        :root {
          --bg-color: ${theme === 'dark' ? '#121212' : '#fafafa'};
          --text-main: ${theme === 'dark' ? '#f0f0f0' : '#111'};
          --text-muted: ${theme === 'dark' ? '#aaa' : '#666'};
          --border-color: ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
          --sidebar-bg: ${theme === 'dark' ? 'rgba(25, 25, 25, 0.85)' : 'rgba(250, 250, 250, 0.85)'};
          --chat-input-bg: ${theme === 'dark' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
          --app-font: ${fontFamily === 'serif' ? 'var(--font-serif)' : fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-klee)'};
          --app-font-size: ${fontSize}px;
          --ui-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        ${isVertical ? `
          .markdown-body {
            text-orientation: mixed;
          }
          .markdown-body p {
            margin-block-end: 2.5em !important;
          }
          .${styles.messageRow} {
            margin-bottom: 0 !important;
            margin-left: 3.5rem !important;
          }
          .review-markdown ul, .review-markdown ol {
            padding-left: 1.8rem;
            margin-top: 0.8rem;
            margin-bottom: 0.8rem;
          }
        ` : ''}
      ` }} />

      {/* UI背景（単色無地） */}
      <div className={styles.overlayGradient} />
      {gameState === 'BRIEFING' && <div className={styles.briefingOverlay} />}

      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}

      {/* 感想戦（レビューUI 左サイドバー） */}
      <aside style={{ position: 'relative', width: endingPhase === 'REVIEW' ? `${leftSidebarWidth}px` : '0px', transition: leftDragRef.current ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden', background: 'var(--sidebar-bg)', borderRight: endingPhase === 'REVIEW' ? '1px solid var(--border-color)' : 'none', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div
          onMouseDown={(e) => { leftDragRef.current = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}
          style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '100%', cursor: 'ew-resize', zIndex: 100, background: 'transparent' }}
        />
        {endingPhase === 'REVIEW' && (
          <div className="fade-in" style={{ width: `${leftSidebarWidth}px`, height: '100%', display: 'flex', flexDirection: 'column', padding: '1.5rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <h2 style={{ letterSpacing: '2px', margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>感想戦</h2>
              <button onClick={() => setEndingPhase('MENU')} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.4rem 1rem', letterSpacing: '1px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }}>MENUへ戻る</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem', paddingRight: '0.5rem' }}>
              {reviewMessages.map((msg, idx) => {
                // 本編履歴や非表示プロンプトは表示しない
                if (idx < messages.length || msg.isHidden) return null;
                return (
                  <div key={idx} className="review-markdown" style={{ color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--text-main)', whiteSpace: 'pre-wrap', background: msg.role === 'user' ? 'transparent' : 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: msg.role !== 'user' ? '1px solid var(--border-color)' : 'none', lineHeight: 1.8, fontSize: '0.9rem' }}>
                    {msg.role === 'user' && '＞ '}
                    <ReactMarkdown>{formatNovelText(msg.parts[0].text, false)}</ReactMarkdown>
                  </div>
                );
              })}
              {isLoading && <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem', fontSize: '0.9rem' }}>🖋 GMが記述中……</p>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <textarea
                value={reviewInputText}
                onChange={e => setReviewInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    sendReviewMessage();
                  }
                }}
                placeholder="GMに質問する... (Ctrl+Enterで送信)"
                style={{ width: '100%', background: 'var(--chat-input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.8rem', borderRadius: '4px', minHeight: '60px', fontFamily: 'inherit', resize: 'vertical', fontSize: '0.9rem' }}
              />
              <button onClick={() => sendReviewMessage()} disabled={isLoading || !reviewInputText.trim()} style={{ width: '100%', background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', padding: '0.8rem', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', letterSpacing: '2px', opacity: (isLoading || !reviewInputText.trim()) ? 0.5 : 1, fontSize: '0.9rem' }}>
                送信
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className={styles.mainChat}>
        <div
          className={styles.chatHistory}
          ref={scrollRef}
          style={{
            writingMode: (isVertical && gameState === 'PLAYING') ? 'vertical-rl' : 'horizontal-tb',
            overflowX: (isVertical && gameState === 'PLAYING') ? 'auto' : 'hidden',
            overflowY: (isVertical && gameState === 'PLAYING') ? 'hidden' : 'auto'
          }}
        >

          {/* ブリーフィング（導入）画面 */}
          {gameState === 'BRIEFING' && (
            <div className="fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '2rem', position: 'relative', zIndex: 11 }}>
              <h2 style={{ fontFamily: 'var(--app-font)', color: 'var(--text-main)', marginBottom: '2rem', textAlign: 'center', letterSpacing: '4px', borderBottom: 'none' }}>
                INTRODUCTION
              </h2>
              <div className="markdown-body" style={{ background: 'var(--sidebar-bg)', padding: '3rem 4rem', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                {briefingText ? (
                  <ReactMarkdown>{formatNovelText(briefingText, false)}</ReactMarkdown>
                ) : (
                  <p>No briefing file loaded.</p>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                <button
                  className={styles.btn}
                  onClick={startInitialChat}
                  style={{ padding: '1.2rem 4rem', fontSize: '1.2rem', background: '#111', color: '#fff', border: 'none' }}
                >
                  プロローグを読む
                </button>
              </div>
            </div>
          )}

          {/* プレイ中のチャット表示 */}
          {gameState === 'PLAYING' && renderedMessages}

          {/* エンディング「幕を閉じる」ボタン */}
          {gameState === 'PLAYING' && endingPhase === 'READY_TO_END' && (
            <div className="fade-in" style={{
              textAlign: isVertical ? 'left' : 'center',
              marginTop: isVertical ? '0' : '4rem',
              marginLeft: isVertical ? '4rem' : '0',
              marginBottom: '6rem',
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'column',
              alignItems: isVertical ? 'center' : 'center',
            }}>
              <button
                className={styles.btn}
                onClick={() => {
                  setIsSidebarOpen(false);
                  setEndingPhase('FADE_OUT');
                  setTimeout(() => setEndingPhase('MENU'), 3000);
                }}
                style={{
                  padding: isVertical ? '3rem 1.5rem' : '1.5rem 5rem',
                  fontSize: '1.2rem',
                  background: 'var(--text-main)',
                  color: 'var(--bg-color)',
                  border: 'none',
                  letterSpacing: '8px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                  transition: 'transform 0.3s ease'
                }}
                onMouseOver={(e: any) => e.target.style.transform = 'translateY(-2px)'}
                onMouseOut={(e: any) => e.target.style.transform = 'translateY(0)'}
              >
                幕を閉じる
              </button>
            </div>
          )}

          {/* プロローグ表示後の「物語に入る」ボタン（フェーズ2がまだ開始されていない時のみ） */}
          {gameState === 'PLAYING' && messages.length <= 2 && !isLoading && (
            <div className="fade-in" style={{
              textAlign: isVertical ? 'left' : 'center',
              marginTop: isVertical ? '0' : '3rem',
              marginLeft: isVertical ? '3rem' : '0',
              marginBottom: '2rem',
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'column',
              alignItems: isVertical ? 'center' : 'center',
              gap: '1.5rem',
            }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', letterSpacing: '2px', fontFamily: 'var(--app-font)', margin: 0, lineHeight: 2 }}>
                ここから、あなたの行動が物語を動かします。{isVertical ? '' : <br />}用意ができたら「物語に入る」を押してください。
              </p>
              <button
                className={styles.btn}
                onClick={startPhase2}
                style={{ padding: isVertical ? '2rem 1rem' : '1rem 4rem', fontSize: '1rem', background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', letterSpacing: '4px', whiteSpace: 'nowrap' }}
              >
                物語に入る
              </button>
            </div>
          )}

          {isLoading && (
            <div className="fade-in writing-indicator" style={{ color: 'var(--text-muted)', marginTop: '2rem', fontStyle: 'italic' }}>
              🖋 記述中……
            </div>
          )}
        </div>

        {/* フローティング「手帳を開く」ボタン */}
        {!isSidebarOpen && gameState === 'PLAYING' && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            style={{ position: 'fixed', top: '20px', right: '0', background: '#333', color: '#fff', padding: '10px 15px 10px 20px', borderRadius: '30px 0 0 30px', border: 'none', cursor: 'pointer', zIndex: 100, display: 'flex', alignItems: 'center', boxShadow: '-2px 2px 10px rgba(0,0,0,0.2)', fontSize: '0.8rem', letterSpacing: '1px' }}
          >
            <IconSidebar /> 手帳を開く
          </button>
        )}

        {/* エンディング演出オーバーレイ */}
        {(endingPhase === 'FADE_OUT' || endingPhase === 'MENU') && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: '#000', zIndex: 1000,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            opacity: endingPhase === 'FADE_OUT' ? 0 : 1,
            animation: endingPhase === 'FADE_OUT' ? 'fadeInSlow 3s ease-in-out forwards' : 'none',
            color: '#fff', fontFamily: 'var(--font-serif)',
          }}>
            {endingPhase === 'FADE_OUT' && (
              <div style={{ animation: 'fadeInSlow 2.5s ease-in-out forwards', padding: '2rem', height: '100%', display: 'flex', alignItems: 'center' }}>
                <p style={{ letterSpacing: '4px', fontSize: '1.2rem', textAlign: 'center', lineHeight: 2 }}>
                  ― あなたの物語はここで幕を閉じます ―
                </p>
              </div>
            )}
            {endingPhase === 'MENU' && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', maxWidth: '600px', width: '100%', padding: '2rem' }}>
                <h2 style={{ letterSpacing: '8px', fontSize: '2rem', marginBottom: '1rem', color: '#fff', fontWeight: 'bold' }}>THE END</h2>
                <p style={{ color: '#aaa', letterSpacing: '2px', marginBottom: '2rem', textAlign: 'center', fontSize: '1rem' }}>
                  素晴らしい物語でした。<br />ここから先はどうしますか？
                </p>
                
                <button onClick={() => {
                  setEndingPhase('REVIEW');
                  sendReviewMessage("シナリオクリアお疲れ様でした！それでは、感想戦をよろしくお願いします！");
                }} style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent-red)', padding: '1.5rem 3rem', color: '#fff', fontSize: '1.1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: '0.3s' }}
                onMouseOver={(e: any) => e.target.style.background = 'var(--accent-red)'}
                onMouseOut={(e: any) => e.target.style.background = 'var(--accent-glow)'}>
                  感想戦をはじめる（ネタバレあり解説）
                </button>

                <button onClick={() => {
                  setEndingPhase('NONE');
                  showToast('エピローグの続きを再開しました');
                }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem 3rem', color: '#aaa', fontSize: '1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', transition: '0.3s' }}
                onMouseOver={(e: any) => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; }}
                onMouseOut={(e: any) => { e.target.style.background = 'transparent'; e.target.style.color = '#aaa'; }}>
                  エピローグの続きを遊ぶ（フリーモード）
                </button>

                <button onClick={handleDownloadPlayLog} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem 3rem', color: '#aaa', fontSize: '1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', transition: '0.3s' }}
                onMouseOver={(e: any) => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; }}
                onMouseOut={(e: any) => { e.target.style.background = 'transparent'; e.target.style.color = '#aaa'; }}>
                  物語をテキスト形式で出力する（プレイログ）
                </button>

                <button onClick={handleSaveData} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem 3rem', color: '#aaa', fontSize: '1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', transition: '0.3s' }}
                onMouseOver={(e: any) => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; }}
                onMouseOut={(e: any) => { e.target.style.background = 'transparent'; e.target.style.color = '#aaa'; }}>
                  システム状態をまるごとセーブデータとして保存
                </button>

                <button onClick={() => { resetAllState(); setGameState('WELCOME'); }} style={{ background: 'transparent', border: 'none', padding: '1rem', color: '#666', fontSize: '0.9rem', letterSpacing: '2px', marginTop: '1rem', cursor: 'pointer', textDecoration: 'underline' }}
                onMouseOver={(e: any) => e.target.style.color = '#aaa'}
                onMouseOut={(e: any) => e.target.style.color = '#666'}>
                  トップ画面へ戻る
                </button>
              </div>
            )}
          </div>
        )}

        {/* 入力欄（ブリーフィング、エンディング演出中は非表示） */}
        <div className={styles.inputArea} style={{ display: (gameState === 'BRIEFING' || endingPhase === 'FADE_OUT' || endingPhase === 'MENU' || endingPhase === 'REVIEW') ? 'none' : 'flex', flexDirection: 'column', gap: '8px', zIndex: 100 }}>

          {/* 入力補助・特殊コマンドボタン */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px', fontSize: '1.2rem', cursor: 'pointer', transition: '0.3s' }}
                  title="画面設定"
                >
                  ⚙
                </button>
                {showSettings && (
                  <div style={{ position: 'absolute', bottom: '100%', left: '0', marginBottom: '8px', background: 'var(--sidebar-bg)', border: `1px solid var(--border-color)`, padding: '1rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.8rem', zIndex: 200, minWidth: '220px', boxShadow: '0 -4px 10px rgba(0,0,0,0.1)' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>設定</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>ダークモード</span>
                      <div
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        style={{
                          width: '40px', height: '20px', background: theme === 'dark' ? '#555' : '#ccc',
                          borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '2px', left: theme === 'dark' ? '22px' : '2px',
                          width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </div>
                    <select value={fontFamily} onChange={e => setFontFamily(e.target.value as any)} style={{ background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px' }}>
                      <option value="serif">明朝体 (Serif)</option>
                      <option value="sans">ゴシック体 (Sans)</option>
                      <option value="klee">手書き風 (Klee One)</option>
                    </select>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between' }}>
                        文字サイズ: <span>{fontSize}px</span>
                      </label>
                      <input
                        type="range"
                        min="12"
                        max="28"
                        step="1"
                        value={fontSize}
                        onChange={e => setFontSize(Number(e.target.value))}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>縦書きモード</span>
                      <div
                        onClick={() => setIsVertical(!isVertical)}
                        style={{
                          width: '40px', height: '20px', background: isVertical ? '#555' : '#ccc',
                          borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '2px', left: isVertical ? '22px' : '2px',
                          width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <button onClick={handleSaveData} style={{ flex: 1, background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>手動セーブ</button>
                      <button onClick={handleLoadData} style={{ flex: 1, background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>手動ロード</button>
                    </div>
                    <button onClick={() => { setGameState('SAVES'); setShowSettings(false); }} style={{ background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '4px', textAlign: 'center' }}>シナリオ選択画面へ</button>
                    <button onClick={() => {
                      if (confirm("トップ画面へ戻りますか？（現在の進行状況は自動セーブされています）")) {
                        setGameState('WELCOME'); 
                        setShowSettings(false);
                      }
                    }} style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '4px', textAlign: 'center' }}>トップ画面へ戻る</button>
                  </div>
                )}
              </div>

              <button onClick={() => insertTags('「', '」')} style={{ fontSize: '0.75rem', color: 'var(--text-main)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer' }}>「」セリフ</button>
              <button onClick={() => setInputText("※GMへ：")} style={{ fontSize: '0.75rem', color: 'var(--text-main)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer' }}>※GMへ：</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', width: '100%', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef as any}
              className={styles.chatInput}
              style={{ minHeight: '80px', maxHeight: '300px', flex: 1, resize: 'none', padding: '12px' }}
              placeholder="Enterで送信、Shift+Enterで改行"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={isLoading || gameState === 'BRIEFING'}
            />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ position: 'absolute', top: '-45px', right: '0', width: '100%', display: 'flex', gap: '5px', zIndex: 10 }}>
                {/* 最新へ（左側） */}
                <button
                  onClick={scrollToBottom}
                  style={{
                    flex: 1, height: '36px', background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', transition: 'color 0.2s'
                  }}
                  title="最新の文へ"
                >
                  <span style={{ transform: isVertical ? 'rotate(90deg)' : 'none', display: 'flex', alignItems: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M19 12l-7 7-7-7"/>
                    </svg>
                  </span>
                </button>

                {/* 先頭へ（右側） */}
                <button
                  onClick={scrollToTop}
                  style={{
                    flex: 1, height: '36px', background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', transition: 'color 0.2s'
                  }}
                  title="先頭へ"
                >
                  <span style={{ transform: isVertical ? 'rotate(90deg)' : 'none', display: 'flex', alignItems: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5M5 12l7-7 7 7"/>
                    </svg>
                  </span>
                </button>
              </div>
              <button
                className={styles.sendBtn}
                onClick={sendMessage}
                disabled={isLoading || gameState === 'BRIEFING'}
                style={{ height: '40px', padding: '0 2rem' }}
              >
                送信
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* サイドバー（初期情報 ＋ 抽出された特殊コマンド情報） */}
      <aside className={styles.sidebar} style={{ position: 'relative', width: (isSidebarOpen && gameState === 'PLAYING') ? `${sidebarWidth}px` : '0px', padding: 0, overflowY: 'hidden', overflowX: 'hidden', borderLeft: isSidebarOpen ? '1px solid var(--border-color)' : 'none', transition: dragRef.current ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: (isSidebarOpen && gameState === 'PLAYING') ? 1 : 0, display: 'flex', flexDirection: 'column' }}>

        <div
          onMouseDown={(e) => { dragRef.current = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}
          style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', cursor: 'ew-resize', zIndex: 100, background: 'transparent' }}
        />

        {/* 固定ヘッダー */}
        <div style={{ flexShrink: 0, background: 'var(--sidebar-bg)', zIndex: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', padding: '0.8rem 1.5rem' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => toggleAllSections(true)} style={{ fontSize: '0.7rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', letterSpacing: '1px' }}>一括展開</button>
            <button onClick={() => toggleAllSections(false)} style={{ fontSize: '0.7rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', letterSpacing: '1px' }}>一括折りたたみ</button>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '4px 8px', letterSpacing: '1px' }}
          >
            ✕ 閉じる
          </button>
        </div>

        {/* スクロール可能なメインコンテンツ */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '2rem 2rem 4rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '4rem', scrollBehavior: 'smooth' }}>

          <div className={styles.sidebarSection} style={{ paddingRight: '0.5rem', whiteSpace: 'pre-wrap' }}>
            <h3 onClick={() => setOpenSections(prev => ({ ...prev, howTo: !prev.howTo }))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>遊び方</span>
              <span style={{ fontSize: '0.7rem', color: '#999' }}>{openSections.howTo ? '▲' : '▼'}</span>
            </h3>
            {openSections.howTo && (
              <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', lineHeight: '1.8', margin: '1rem 0' }}>
                <h4 style={{ marginBottom: '8px', color: 'var(--text-main)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>▼ 入力のアドバイス</h4>
                <ul style={{ paddingLeft: '1.2rem', marginBottom: '1.5rem' }}>
                  <li style={{ marginBottom: '0.5rem' }}><strong>「」セリフ</strong>：登場人物としての発言</li>
                  <li style={{ marginBottom: '0.5rem' }}><strong>行動・自由入力</strong>：ドアを開ける、見回す等</li>
                  <li><strong>※GMへ：</strong> システムに対して、現在のメタな状況確認やメタ質問を行いたい時に使います</li>
                </ul>

                <h4 style={{ marginBottom: '8px', color: 'var(--text-main)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>▼ システム情報（手帳の更新）</h4>
                <ul style={{ paddingLeft: '1.2rem' }}>
                  <li style={{ marginBottom: '0.5rem' }}><strong>人物情報ボタン</strong>：出逢った人物の印象・情報整理</li>
                  <li style={{ marginBottom: '0.5rem' }}><strong>事実確認ボタン</strong>：判明した事実・謎の整理</li>
                  <li><strong>モノローグボタン</strong>：現在の主人公の独白を自動記述</li>
                </ul>
              </div>
            )}
          </div>

          {/* モノローグ情報 */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, monologue: !prev.monologue }))} style={{ cursor: 'pointer', flex: 1 }}>主人公の独白</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('monologue'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, monologue: !prev.monologue }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.monologue ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.monologue && (
              <div style={{ margin: '1rem 0' }}>
                {monologueData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>まだ独白はありません</p>
                ) : (
                  monologueData.map((text, i) => (
                    <details key={i} open={i === monologueData.length - 1} style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', outline: 'none' }}>
                        独白 #{i + 1} {i === monologueData.length - 1 ? '(最新)' : ''}
                      </summary>
                      <p style={{ fontFamily: 'var(--app-font)', fontSize: '0.85rem', fontStyle: 'italic', lineHeight: '1.8', color: 'var(--text-main)', paddingLeft: '1rem', borderLeft: '2px solid var(--border-color)' }}>
                        「 {text} 」
                      </p>
                    </details>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 人物情報JSONを展開 */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, characters: !prev.characters }))} style={{ cursor: 'pointer', flex: 1 }}>登場人物</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('characters'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, characters: !prev.characters }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.characters ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.characters && (
              <ul className={styles.sidebarList}>
                {charactersData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '1rem 0' }}>まだ判明している人物はいません</p>
                ) : (
                  charactersData.map((c, i) => {
                    const isFemale = c.gender === 'female' || (!c.gender && /女|少女|娘|婦|嬢|姉|妹|彼女|妻|母|ヒロイン/g.test(c.info + c.name));
                    return (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontFamily: 'var(--font-serif)', marginBottom: '1.5rem' }}>

                        {/* 左：画像・メニュー列 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '96px', flexShrink: 0 }}>
                          <div style={{ width: '96px', height: '96px', borderRadius: '4px', background: c.image ? `url(${c.image}) center/cover no-repeat` : 'var(--bg-color)', display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', cursor: 'pointer', overflow: 'hidden' }} onClick={() => document.getElementById(`file-${i}`)?.click()}>
                            {!c.image && (
                              c.isGenerating ? <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>準備中..</span> :
                                isFemale ? (
                                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '36px', height: '36px', color: 'var(--text-muted)', opacity: 0.4 }}>
                                    <path d="M12 2C10.9 2 10 2.9 10 4s.9 2 2 2 2-.9 2-2-.9-2-2-2z M12 6.5C10 6.5 9.1 7.2 8.7 8l-2.6 8h3.3v6h5.2v-6h3.3l-2.6-8c-.4-.8-1.3-1.5-3.3-1.5z" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '36px', height: '36px', color: 'var(--text-muted)', opacity: 0.4 }}>
                                    <path d="M12 2C10.9 2 10 2.9 10 4s.9 2 2 2 2-.9 2-2-.9-2-2-2z M14 6H10A2 2 0 0 0 8 8v6h2v8h4v-8h2V8a2 2 0 0 0-2-2z" />
                                  </svg>
                                )
                            )}
                          </div>
                          <input
                            type="file"
                            id={`file-${i}`}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={(e) => { handleImageUpload(e, c.name); setActiveCharacterOptions(null); }}
                          />
                          {!c.isGenerating && (
                            <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                              <button
                                onClick={() => setActiveCharacterOptions(activeCharacterOptions === c.name ? null : c.name)}
                                style={{ fontSize: '1.2rem', lineHeight: '10px', padding: '2px 8px', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                              >
                                ⋯
                              </button>
                              {activeCharacterOptions === c.name && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: 'var(--sidebar-bg)', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '4px', zIndex: 10, minWidth: '90px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                                  <button
                                    onClick={() => { handleGeneratePrompt(c.name); setActiveCharacterOptions(null); }}
                                    style={{ fontSize: '0.6rem', padding: '4px', background: '#333', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer', textAlign: 'center' }}
                                  >
                                    プロンプト生成
                                  </button>
                                  <label
                                    htmlFor={`file-${i}`}
                                    style={{ fontSize: '0.6rem', padding: '4px', background: '#eab308', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer', textAlign: 'center', margin: 0 }}
                                  >
                                    画像アップ
                                  </label>
                                  {c.image && (
                                    <button
                                      onClick={() => { handleDeleteImage(c.name); setActiveCharacterOptions(null); }}
                                      style={{ fontSize: '0.6rem', padding: '4px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer', textAlign: 'center' }}
                                    >
                                      画像削除
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 右：名前・情報列 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <strong style={{ color: 'var(--text-main)', letterSpacing: '1px' }}>{c.name}</strong>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{c.info}</span>
                          {c.lastPrompt && (
                            <details style={{ marginTop: '6px' }}>
                              <summary style={{ fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.5px', outline: 'none' }}>
                                生成プロンプト
                              </summary>
                              <div style={{ marginTop: '4px', padding: '6px 8px', background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-main)', lineHeight: '1.5', margin: '0 0 6px 0', wordBreak: 'break-all', userSelect: 'text', cursor: 'text' }}>
                                  {c.lastPrompt}
                                </p>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(c.lastPrompt!).then(() => showToast('コピーしました')).catch(() => { });
                                  }}
                                  style={{ fontSize: '0.6rem', padding: '2px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                  コピー
                                </button>
                              </div>
                            </details>
                          )}
                        </div>

                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {/* 事実と謎JSONを展開 */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, facts: !prev.facts }))} style={{ cursor: 'pointer', flex: 1 }}>判明した事実</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('facts'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, facts: !prev.facts }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.facts ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.facts && (
              <ul className={styles.sidebarList}>
                {factsData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>まだ有力な事実はありません</p>
                ) : (
                  factsData.map((f, i) => <li key={i} className={styles.sidebarItem} style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{f}</li>)
                )}
              </ul>
            )}
          </div>

          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, mysteries: !prev.mysteries }))} style={{ cursor: 'pointer', flex: 1 }}>未解決の謎</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('mysteries'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, mysteries: !prev.mysteries }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.mysteries ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.mysteries && (
              <ul className={styles.sidebarList}>
                {mysteriesData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>未解決の謎はありません</p>
                ) : (
                  mysteriesData.map((m, i) => <li key={i} className={styles.sidebarItem} style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{m}</li>)
                )}
              </ul>
            )}
          </div>

          {/* プレイヤーメモ */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, memo: !prev.memo }))} style={{ cursor: 'pointer', flex: 1 }}>メモ</span>
              <span onClick={() => setOpenSections(prev => ({ ...prev, memo: !prev.memo }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.memo ? '▲' : '▼'}</span>
            </h3>
            {openSections.memo && (
              <div style={{ margin: '1rem 0' }}>
                <textarea
                  value={playerMemo}
                  onChange={(e) => setPlayerMemo(e.target.value)}
                  placeholder="気になったことや推理をここに書き留めておきましょう..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '10px 12px',
                    fontFamily: 'var(--app-font)',
                    fontSize: '0.85rem',
                    lineHeight: '1.8',
                    color: 'var(--text-main)',
                    background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </div>

          {/* エンディングメニューへ飛ぶボタン (クリア後) */}
          {messages.some(msg => msg?.parts?.[0]?.text?.includes('【終】')) && endingPhase === 'NONE' && (
            <div style={{ marginTop: '2rem', paddingBottom: '2rem' }}>
              <button
                onClick={() => setEndingPhase('MENU')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: 'transparent',
                  border: '1px solid var(--accent-red)',
                  color: 'var(--accent-red)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  letterSpacing: '2px',
                  fontSize: '0.9rem',
                  transition: '0.3s',
                  boxShadow: '0 4px 15px rgba(255, 0, 0, 0.1)'
                }}
                onMouseOver={(e: any) => { e.target.style.background = 'var(--accent-red)'; e.target.style.color = '#fff'; }}
                onMouseOut={(e: any) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--accent-red)'; }}
              >
                エンディングメニューを開く
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
