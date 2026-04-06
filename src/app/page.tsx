'use client';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './page.module.css';

// --- SVG Icons ---
const IconImage = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', marginBottom: '-3px'}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>;
const IconUser = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', marginBottom: '-3px'}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const IconFile = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', marginBottom: '-3px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>;
const IconSidebar = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', marginBottom: '-2px'}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>;
const IconMessage = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', marginBottom: '-2px'}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;
const IconSearch = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', marginBottom: '-2px'}}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const IconBook = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', marginBottom: '-2px'}}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>;

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
  } catch(e) { console.error(e); }
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
  } catch(e) { return null; }
}

async function getAllIDBSavesMeta(): Promise<{key: string, coverImage: string}[]> {
  try {
    const db = await getIDB();
    return new Promise<{key: string, coverImage: string}[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      const metaList: {key: string, coverImage: string}[] = [];
      req.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
           const key = cursor.key as string;
           if (key.startsWith('auto_save_')) {
             metaList.push({ key, coverImage: cursor.value.coverImage || '' });
           }
           cursor.continue();
        } else {
           resolve(metaList);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch(e) { return []; }
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
  } catch(e) { console.error(e); }
}

// 小説風のテキスト整形ユーティリティ（セリフ以外の段落に全角スペースを補完）
const formatNovelText = (text: string, isVertical: boolean) => {
  if (!text) return '';
  let lines = text.replace(/\\n/g, '\n').split('\n');
  lines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    
    // Markdownの装飾等の行は字下げを無視
    if (/^[#\-\*>`]/.test(trimmed) || /^!\[/.test(trimmed) || /^\[/.test(trimmed) || /^\d+\./.test(trimmed)) {
      return line;
    }
    // 会話や特殊括弧の始まりは字下げしない
    if (/^[「『（(\【]/.test(trimmed)) return line;
    // **名前**「セリフ」や **名前**（心の声） は字下げしない
    if (/^\*\*[^*]+\*\*[「『（]/.test(trimmed) || /^\*\*[^*]+\*\*$/.test(trimmed)) return line;
    // すでに空白で始まっている場合はそのまま
    if (/^[　\s]/.test(line)) return line;

    return '　' + line;
  });
  let formatted = lines.join('\n');

  if (isVertical) {
    formatted = formatted.replace(/!(?!\[)/g, '！').replace(/\?(?!\[)/g, '？');
  }
  return formatted;
};

export default function ChatNoir() {
  const [apiKey, setApiKey] = useState('');
  
  // ゲームの進行ステータス
  const [gameState, setGameState] = useState<'WELCOME' | 'SAVES' | 'LOGIN' | 'BRIEFING' | 'PLAYING'>('WELCOME');
  
  // ファイルから読み込んだテキストデータを保持するState
  const [gmRuleText, setGmRuleText] = useState('');
  const [scenarioText, setScenarioText] = useState('');
  const [briefingText, setBriefingText] = useState('');
  const [prologueText, setPrologueText] = useState('');
  
  // カバー画像
  const [coverImage, setCoverImage] = useState<string>('');
  
  // トーストUI
  const [toastMsg, setToastMsg] = useState('');
  const [autoSaves, setAutoSaves] = useState<{key: string, coverImage: string}[]>([]);
  
  // 選択されたモデル
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');

  // サイドバーの開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [charactersData, setCharactersData] = useState<{name:string, gender?:string, info:string, image:string|null, isGenerating:boolean}[]>([]);
  const [factsData, setFactsData] = useState<string[]>([]);
  const [mysteriesData, setMysteriesData] = useState<string[]>([]);
  const [monologueData, setMonologueData] = useState<string>('');
  const [activeCharacterOptions, setActiveCharacterOptions] = useState<string | null>(null);

  const [openSections, setOpenSections] = useState({ howTo: true, monologue: true, characters: true, facts: true, mysteries: true });

  const toggleAllSections = (expand: boolean) => {
    setOpenSections({ howTo: expand, monologue: expand, characters: expand, facts: expand, mysteries: expand });
  };

  // UI設定・サイドバー幅
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [fontFamily, setFontFamily] = useState<'serif'|'sans'|'klee'>('serif');
  const [fontSize, setFontSize] = useState<number>(16);
  const [isVertical, setIsVertical] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(380);
  const dragRef = useRef<boolean>(false);

  // セッション状態の復元判定
  const [isLoaded, setIsLoaded] = useState(false);

  // チャットの状態管理
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const showToast = (message: string) => {
    setToastMsg(message);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const restoreStateData = (parsed: any) => {
    if (parsed.gameState) {
      if (parsed.gameState === 'WELCOME' || parsed.gameState === 'SAVES') {
        setGameState('PLAYING');
      } else {
        setGameState(parsed.gameState);
      }
    } else {
      setGameState('PLAYING');
    }
    if (parsed.messages) setMessages(parsed.messages);
    if (parsed.gmRuleText) setGmRuleText(parsed.gmRuleText);
    if (parsed.scenarioText) setScenarioText(parsed.scenarioText);
    if (parsed.briefingText) setBriefingText(parsed.briefingText);
    if (parsed.prologueText) setPrologueText(parsed.prologueText);
    if (parsed.coverImage) setCoverImage(parsed.coverImage);
    if (parsed.apiKey) setApiKey(parsed.apiKey);
    if (parsed.charactersData) setCharactersData(parsed.charactersData);
    if (parsed.factsData) setFactsData(parsed.factsData);
    if (parsed.mysteriesData) setMysteriesData(parsed.mysteriesData);
    if (parsed.monologueData) setMonologueData(parsed.monologueData);
    if (parsed.theme) setTheme(parsed.theme);
    if (parsed.fontFamily) setFontFamily(parsed.fontFamily);
    if (parsed.fontSize) setFontSize(parsed.fontSize);
    if (parsed.isVertical !== undefined) setIsVertical(parsed.isVertical);
    if (parsed.sidebarWidth) setSidebarWidth(parsed.sidebarWidth);
    if (parsed.isSidebarOpen !== undefined) setIsSidebarOpen(parsed.isSidebarOpen);
  };

  // マウント時に保存されたキー・オートセーブを読み込む
  useEffect(() => {
    const saved = localStorage.getItem('chatnoir_apiKey');
    if (saved) setApiKey(saved);
    
    const runStartupInfo = async () => {
      // セッションデータからの状態復元 (リロード対策)
      const currentKey = sessionStorage.getItem('chatnoir-current-save-key');
      const isReload = sessionStorage.getItem('chatnoir-reloaded') === '1' && currentKey;
      sessionStorage.setItem('chatnoir-reloaded', '1');

      // まず全オートセーブのメタデータを読み込んでおく（SAVES画面用）
      const metas = await getAllIDBSavesMeta();
      setAutoSaves(metas);

      if (isReload) {
        const autoSavedData = await loadFromIDB(currentKey as string);
        if (autoSavedData) {
          restoreStateData(autoSavedData);
          showToast('前回プレイ時のセッションから復帰しました');
        }
      }
      setIsLoaded(true);
    };
    runStartupInfo();
  }, []);

  // 常に最新状態をバックアップ (IndexedDB)
  useEffect(() => {
    if (isLoaded && gameState !== 'WELCOME' && gameState !== 'SAVES') {
      const currentData = {
        gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, coverImage, apiKey,
        charactersData, factsData, mysteriesData, monologueData, theme, fontFamily, fontSize, isVertical, sidebarWidth, isSidebarOpen
      };
      
      let title = "Unknown_Scenario";
      const match = briefingText?.match(/^#\s+(.+)$/m) || scenarioText?.match(/^#\s+(.+)$/m);
      if (match) {
        title = match[1].trim().replace(/[\/\\?%*:|"<>]/g, '_');
      }
      const runKey = `auto_save_${title}`;
      sessionStorage.setItem('chatnoir-current-save-key', runKey);
      saveToIDB(runKey, currentData);
    }
  }, [isLoaded, gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, coverImage, apiKey, charactersData, factsData, mysteriesData, monologueData, theme, fontFamily, fontSize, isVertical, sidebarWidth, isSidebarOpen]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // サイドバーのリサイズ処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = false;
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

  // スクロール処理
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      scrollRef.current.scrollLeft = -scrollRef.current.scrollWidth;
    }
  }, [messages, isLoading, gameState, charactersData, factsData, isVertical]);

  // ホイールスクロールの縦書き変換処理
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (isVertical && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft -= e.deltaY;
      }
    };
    
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isVertical]);

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
    if (apiKey.trim() === '' || !gmRuleText || !scenarioText) {
      alert("APIキーと、2つの必須ファイル（GMルール・設定ファイル）をセットしてください！");
      return;
    }
    localStorage.setItem('chatnoir_apiKey', apiKey.trim());
    setMessages([]);
    
    // いきなりゲームを開始せず、まずはブリーフィング画面へ進む
    setGameState('BRIEFING');
  };

  // ブリーフィング画面で「物語を始める」を押した時の処理
  const startInitialChat = async () => {
    setGameState('PLAYING');
    
    const outText = prologueText ? prologueText : "（※プロローグファイルが読み込まれていません。行動を入力して開始してください）";

    // AIに通信して作らせるのではなく、抽出・またはアップロードされたプロローグ生テキストを最初のGM発言として即座にセットする
    const initialHistory = [
      { role: 'user', parts: [{ text: "（システム起動：ゲーム開始。プロローグが読み込まれました。ここから先の行動を判定してください）" }] },
      { role: 'model', parts: [{ text: "# プロローグ\n\n" + outText + "\n\n**（※ここから、あなたの行動が物語を動かします。用意ができたら「OK」と入力してください）**" }] }
    ];
    
    setMessages(initialHistory);

    // プレイ開始時に初期設定から人物情報を自動抽出
    requestSpecialCommand('characters', initialHistory);
  };

  // --- 特殊コマンド（JSON抽出） ---
  const requestSpecialCommand = async (commandType: 'characters' | 'facts' | 'monologue', overrideMessages?: any[]) => {
    if (isLoading) return;
    setIsLoading(true);
    
    // UI（小説空間）には出さず、APIの裏側で送るメッセージ
    let triggerText = '';
    if (commandType === 'characters') {
       triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。このシナリオの主人公（プレイヤー自身）と、現在主人公が把握している登場人物の基本情報を、必ず以下のJSON形式のみで出力せよ。\n```json\n{\n  \"characters\": [\n    { \"name\": \"名前\", \"gender\": \"male または female または unknown\", \"info\": \"年齢・職業などの基本設定と現在の印象\" }\n  ]\n}\n```）";
    } else if (commandType === 'facts') {
       triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。現在主人公が把握している事実と未解決の謎を、必ず以下のJSON形式のみで出力せよ。\n```json\n{\n  \"facts\": [\"事実1\", \"事実2\"],\n  \"mysteries\": [\"未解決の謎1\"]\n}\n```）";
    } else if (commandType === 'monologue') {
       triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。これまでの展開を踏まえ、現在の主人公の心境や整理すべき思考を独白（モノローグ）の形式で出力せよ。\n```json\n{\n  \"monologue\": \"主人公の内心の独白...\"\n}\n```）";
    }

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
                const newChars = parsed.characters.map((c: any) => {
                  const existing = prev.find((old: any) => old.name === c.name);
                  return { ...c, image: existing?.image || null, isGenerating: false };
                });
                return newChars;
              });
              showToast("人物情報を更新しました");
            } else if (commandType === 'facts' && parsed.facts) {
              setFactsData(parsed.facts);
              if (parsed.mysteries) setMysteriesData(parsed.mysteries);
              showToast("事実と謎を更新しました");
            } else if (commandType === 'monologue' && parsed.monologue) {
              setMonologueData(parsed.monologue);
              showToast("モノローグを更新しました");
            }
        } else {
            console.error("JSON形式ではありませんでした:", data.text);
        }
      }
    } catch (err) {
      console.error("コマンド実行失敗:", err);
      alert("情報の取得・解析に失敗しました。");
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
           systemInstruction: gmRuleText + "\n\n" + scenarioText
        })
      });
      const data = await res.json();
      if(res.ok && data.prompt) {
         try {
           await navigator.clipboard.writeText(data.prompt);
           showToast("プロンプトをクリップボードにコピーしました！");
         } catch(e) {
           alert("プロンプト:\n" + data.prompt);
         }
         setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, isGenerating: false } : old));
      } else {
         setCharactersData(curr => curr.map(old => old.name === characterName ? { ...old, isGenerating: false } : old));
         alert("生成に失敗しました: " + (data.error || '不明なエラー'));
      }
    } catch(e) {
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

  // --- セーブ・ロード機能 ---
  const handleSaveData = () => {
    try {
      const saveData = {
        gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, coverImage, apiKey,
        charactersData, factsData, mysteriesData, monologueData, theme, fontFamily, fontSize, isVertical, sidebarWidth, isSidebarOpen
      };
      let title = "Unknown_Scenario";
      const match = briefingText?.match(/^#\s+(.+)$/m) || scenarioText?.match(/^#\s+(.+)$/m);
      if (match) {
        title = match[1].trim().replace(/[\/\\?%*:|"<>]/g, '_');
      }
      
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}_${new Date().toISOString().slice(0, 10)}.json`;
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

  // --- 通常の行動入力 ---
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const newUserMsg = { role: 'user', parts: [{ text: inputText }] };
    const newHistory = [...messages, newUserMsg];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      } else {
        alert("エラーが発生しました: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("通信に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  if (gameState === 'WELCOME') {
    return (
      <div className={`${styles.welcomeContainer} fade-in`}>
        <img src="/logo_yoko.png" alt="ChatNoir" className={styles.welcomeLogo} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button className={styles.welcomeBtn} onClick={() => setGameState('LOGIN')}>
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
               <IconSidebar /> 管理コンソール - シナリオ一覧
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
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '1px' }}>
                    {meta.key.replace('auto_save_', '')}
                  </div>
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
          {coverImage ? (
            <div style={{ width: '100%', marginBottom: '1.5rem', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={coverImage} alt="Cover" style={{ width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'cover', display: 'block' }} />
            </div>
          ) : (
            <img src="/logo.png" alt="Chat;Noir" className={styles.logoImage} />
          )}
          <p className={styles.subtitle}>シナリオファイルをアップロードして遊ぶ</p>
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

            <button 
              onClick={loadDefaultScenario}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.8rem', background: 'transparent', color: '#111', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '2px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s', fontFamily: 'var(--font-serif)', letterSpacing: '2px' }}
            >
              <IconBook /> サンプルシナリオで遊ぶ
            </button>
            
            <div style={{ textAlign: 'center', background: 'transparent', padding: '1rem', borderBottom: '1px dotted rgba(0,0,0,0.2)', marginTop: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#111', marginBottom: '0.8rem', fontFamily: 'var(--font-serif)', fontWeight: 'bold', letterSpacing: '1px' }}>
                関連ファイルの一括読み込み
              </p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                設定ファイルやプロローグなどに加え、<br/>パッケージ画像（<code>_cover.png</code> 等）もまとめてドロップ可能です。
              </p>
              <input type="file" multiple accept=".md,.txt,image/*" onChange={handleMultiFileRead} style={{ color: 'var(--text-muted)', fontSize: '0.8rem', width: '100%', cursor: 'pointer', padding: '0.5rem', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }} />
            </div>
            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> ルールブック (必須)
                {gmRuleText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              {!gmRuleText && <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setGmRuleText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />}
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> シナリオ設定 (必須)
                {scenarioText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              {!scenarioText && <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setScenarioText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />}
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> 概要ファイル (任意)
                {briefingText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              {!briefingText && <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setBriefingText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />}
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> プロローグ (任意)
                {prologueText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              {!prologueText && <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setPrologueText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />}
            </div>

            <button 
              className={styles.btn} 
              onClick={handleStartLogin}
              style={{ opacity: (!apiKey || !gmRuleText || !scenarioText) ? 0.5 : 1 }}
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
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --bg-color: ${theme === 'dark' ? '#121212' : '#fafafa'};
          --text-main: ${theme === 'dark' ? '#f0f0f0' : '#111'};
          --text-muted: ${theme === 'dark' ? '#aaa' : '#666'};
          --border-color: ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
          --sidebar-bg: ${theme === 'dark' ? 'rgba(25, 25, 25, 0.85)' : 'rgba(250, 250, 250, 0.85)'};
          --chat-input-bg: ${theme === 'dark' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
          --app-font: ${fontFamily === 'serif' ? 'var(--font-serif)' : fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-klee)'};
          --app-font-size: ${fontSize}px;
        }
        ${isVertical ? `
          .markdown-body {
            text-orientation: upright;
          }
          .markdown-body p {
            margin-block-end: 2.5em !important;
          }
          .${styles.messageRow} {
            margin-bottom: 0 !important;
            margin-left: 3.5rem !important;
          }
        ` : ''}
      ` }} />
      
      {/* UI背景（単色無地） */}
      <div className={styles.overlayGradient} />
      {gameState === 'BRIEFING' && <div className={styles.briefingOverlay} />}
      
      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}

      <main className={styles.mainChat}>
        <div 
          className={styles.chatHistory} 
          ref={scrollRef}
          style={{
            writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
            overflowX: isVertical ? 'auto' : 'hidden',
            overflowY: isVertical ? 'hidden' : 'auto'
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
                  <ReactMarkdown>{formatNovelText(briefingText, isVertical)}</ReactMarkdown>
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
                  物語をはじめる
                </button>
              </div>
            </div>
          )}

          {/* プレイ中のチャット表示 */}
          {gameState === 'PLAYING' && messages.map((msg, index) => {
            if (index === 0 && msg.role === 'user') return null;

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
                    fontStyle: msg.role === 'user' ? 'italic' : 'normal'
                  }}
                >
                  <ReactMarkdown>{formatNovelText(msg.parts[0].text, isVertical)}</ReactMarkdown>
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="fade-in" style={{ color: 'var(--text-muted)', opacity: 0.7, marginTop: '2rem', fontStyle: 'italic' }}>
              🖋 記述中...
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



        {/* 入力欄（ブリーフィング中は非表示） */}
        <div className={styles.inputArea} style={{ display: gameState === 'BRIEFING' ? 'none' : 'flex', flexDirection: 'column', gap: '8px', zIndex: 100 }}>
          
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
                    <button onClick={() => { setGameState('SAVES'); setShowSettings(false); }} style={{ background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '4px', textAlign: 'center' }}>シナリオ選択画面へ戻る</button>
                  </div>
                )}
              </div>

              <button onClick={() => insertTags('「', '」')} style={{ fontSize: '0.75rem', color: 'var(--text-main)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer' }}>「」セリフ</button>
              <button onClick={() => setInputText("※GMへ：")} style={{ fontSize: '0.75rem', color: 'var(--text-main)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer' }}>※GMへ：</button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => requestSpecialCommand('characters')} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '2px 8px', borderRadius: '2px', fontSize: '0.75rem', cursor: 'pointer', opacity: isLoading ? 0.5 : 1 }}>
                <IconUser /> 人物情報
              </button>
              <button onClick={() => requestSpecialCommand('facts')} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '2px 8px', borderRadius: '2px', fontSize: '0.75rem', cursor: 'pointer', opacity: isLoading ? 0.5 : 1 }}>
                <IconSearch /> 事実確認
              </button>
              <button onClick={() => requestSpecialCommand('monologue')} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '2px 8px', borderRadius: '2px', fontSize: '0.75rem', cursor: 'pointer', opacity: isLoading ? 0.5 : 1 }}>
                <IconBook /> モノローグ
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
            <input 
              ref={inputRef}
              type="text" 
              className={styles.chatInput} 
              placeholder="どうしますか？（例：「ドアを開ける」「ＯＫ」）..." 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              disabled={isLoading || gameState === 'BRIEFING'}
            />
            <button className={styles.sendBtn} onClick={sendMessage} disabled={isLoading || gameState === 'BRIEFING'}>
              送信
            </button>
          </div>
        </div>
      </main>

      {/* サイドバー（初期情報 ＋ 抽出された特殊コマンド情報） */}
      <aside className={styles.sidebar} style={{ position: 'relative', width: (isSidebarOpen && gameState === 'PLAYING') ? `${sidebarWidth}px` : '0px', padding: (isSidebarOpen && gameState === 'PLAYING') ? '4rem 3rem' : '0', overflowY: isSidebarOpen ? 'auto' : 'hidden', overflowX: 'hidden', borderLeft: isSidebarOpen ? '1px solid var(--border-color)' : 'none', transition: dragRef.current ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: (isSidebarOpen && gameState === 'PLAYING') ? 1 : 0 }}>
         
         <div 
           onMouseDown={(e) => { dragRef.current = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}
           style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', cursor: 'ew-resize', zIndex: 50, background: 'transparent' }} 
         />

         <button 
           onClick={() => setIsSidebarOpen(false)} 
           style={{ position: 'sticky', top: '0', left: '100%', transform: 'translateX(20px)', zIndex: 20, display: 'inline-flex', justifyContent: 'flex-end', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '4px 8px' }}
         >
           ✕ 手帳を閉じる
         </button>
         <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '8px', marginBottom: '1.5rem' }}>
            <button onClick={() => toggleAllSections(true)} style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)' }}>一括展開</button>
            <button onClick={() => toggleAllSections(false)} style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)' }}>一括折りたたみ</button>
         </div>

         <div className={styles.sidebarSection} style={{ paddingRight: '0.5rem', whiteSpace: 'pre-wrap' }}>
          <h3 onClick={() => setOpenSections(prev => ({...prev, howTo: !prev.howTo}))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>HOW TO PLAY</span>
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
        {monologueData && (
          <div className={styles.sidebarSection}>
            <h3 onClick={() => setOpenSections(prev => ({...prev, monologue: !prev.monologue}))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <span>主人公の独白</span>
               <span style={{ fontSize: '0.7rem', color: '#999' }}>{openSections.monologue ? '▲' : '▼'}</span>
            </h3>
            {openSections.monologue && (
              <p style={{fontFamily: 'var(--app-font)', fontSize: '0.85rem', fontStyle: 'italic', lineHeight: '1.8', color: 'var(--text-main)', paddingLeft: '1rem', borderLeft: '2px solid var(--border-color)', margin: '1rem 0'}}>
                「 {monologueData} 」
              </p>
            )}
          </div>
        )}

        {/* 人物情報JSONを展開 */}
        {charactersData.length > 0 && (
          <div className={styles.sidebarSection}>
            <h3 onClick={() => setOpenSections(prev => ({...prev, characters: !prev.characters}))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>登場人物</span>
              <span style={{ fontSize: '0.7rem', color: '#999' }}>{openSections.characters ? '▲' : '▼'}</span>
            </h3>
            {openSections.characters && (
              <ul className={styles.sidebarList}>
              {charactersData.map((c, i) => {
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
                             </div>
                           )}
                         </div>
                       )}
                    </div>
                    
                    {/* 右：名前・情報列 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                       <strong style={{ color: 'var(--text-main)', letterSpacing: '1px' }}>{c.name}</strong>
                       <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{c.info}</span>
                    </div>

                  </li>
                );
              })}
              </ul>
            )}
          </div>
        )}

        {/* 事実と謎JSONを展開 */}
        {factsData.length > 0 && (
          <div className={styles.sidebarSection}>
            <h3 onClick={() => setOpenSections(prev => ({...prev, facts: !prev.facts}))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>判明した事実</span>
              <span style={{ fontSize: '0.7rem', color: '#999' }}>{openSections.facts ? '▲' : '▼'}</span>
            </h3>
            {openSections.facts && (
               <ul className={styles.sidebarList}>
                 {factsData.map((f, i) => <li key={i} className={styles.sidebarItem} style={{fontSize: '0.9rem', color: 'var(--text-main)'}}>{f}</li>)}
               </ul>
            )}
          </div>
        )}

        {mysteriesData.length > 0 && (
          <div className={styles.sidebarSection}>
             <h3 onClick={() => setOpenSections(prev => ({...prev, mysteries: !prev.mysteries}))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <span>未解決の謎</span>
               <span style={{ fontSize: '0.7rem', color: '#999' }}>{openSections.mysteries ? '▲' : '▼'}</span>
             </h3>
             {openSections.mysteries && (
                <ul className={styles.sidebarList}>
                  {mysteriesData.map((m, i) => <li key={i} className={styles.sidebarItem} style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontStyle: 'italic' }}>{m}</li>)}
                </ul>
             )}
          </div>
        )}
      </aside>
    </div>
  );
}
