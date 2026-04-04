'use client';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './page.module.css';

export default function ChatNoir() {
  const [apiKey, setApiKey] = useState('');
  
  // ゲームの進行ステータス
  const [gameState, setGameState] = useState<'LOGIN' | 'BRIEFING' | 'PLAYING'>('LOGIN');
  
  // ファイルから読み込んだテキストデータを保持するState
  const [gmRuleText, setGmRuleText] = useState('');
  const [scenarioText, setScenarioText] = useState('');
  const [briefingText, setBriefingText] = useState('');
  const [prologueText, setPrologueText] = useState('');
  
  // 選択されたモデル
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');

  // サイドバーの開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 特殊コマンドによる情報保持
  const [charactersData, setCharactersData] = useState<{name:string, info:string}[]>([]);
  const [factsData, setFactsData] = useState<string[]>([]);
  const [mysteriesData, setMysteriesData] = useState<string[]>([]);

  // チャットの状態管理
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // マウント時に保存されたキーがあれば読み込む
  useEffect(() => {
    const saved = localStorage.getItem('chatnoir_apiKey');
    if (saved) setApiKey(saved);
  }, []);

  // スクロール処理
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, gameState, charactersData, factsData]);

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

  // サンプルシナリオをサーバーから自動ロード
  const loadDefaultScenario = async () => {
    try {
      const [rGM, rScen, rBrief] = await Promise.all([
        fetch('/scenarios/GMルール.md').then(r => r.text()),
        fetch('/scenarios/歯車_設定.md').then(r => r.text()),
        fetch('/scenarios/歯車_概要.md').then(r => r.text()),
      ]);
      setGmRuleText(rGM);
      setScenarioText(rScen);
      setBriefingText(rBrief);
      
      // 今のサンプルの場合、設定ファイル内にプロローグが含まれているので、正規表現で仮抽出してセットしておく
      const match = rScen.match(/##\s*5\.\s*プロローグ[^\n]*\n+([\s\S]*?)(?=\n+---|\n+##)/);
      if (match && match[1]) {
        setPrologueText(match[1].trim());
      }
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
      { role: 'model', parts: [{ text: outText + "\n\n📍 (プロローグ完了) | 🕐 (開始時刻)" }] }
    ];
    
    setMessages(initialHistory);
  };

  // --- 特殊コマンド（JSON抽出） ---
  const requestSpecialCommand = async (commandType: 'characters' | 'facts') => {
    if (isLoading) return;
    setIsLoading(true);
    
    // UI（小説空間）には出さず、APIの裏側で送るメッセージ
    let triggerText = '';
    if (commandType === 'characters') {
       triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。現在主人公が把握している登場人物の最新情報を、必ず以下のJSON形式のみで出力せよ。\n```json\n{\n  \"characters\": [\n    { \"name\": \"名前\", \"info\": \"現在知っている情報と印象\" }\n  ]\n}\n```）";
    } else {
       triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。現在主人公が把握している事実と未解決の謎を、必ず以下のJSON形式のみで出力せよ。\n```json\n{\n  \"facts\": [\"事実1\", \"事実2\"],\n  \"mysteries\": [\"未解決の謎1\"]\n}\n```）";
    }

    // チャット履歴を維持したまま、最後に一時的なコマンドを足して通信する
    const apiMessages = [...messages, { role: 'user', parts: [{ text: triggerText }] }];

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
              setCharactersData(parsed.characters);
            } else if (commandType === 'facts' && parsed.facts) {
              setFactsData(parsed.facts);
              if (parsed.mysteries) setMysteriesData(parsed.mysteries);
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

  // --- APIキー入力・ファイルアップロード画面 ---
  if (gameState === 'LOGIN') {
    return (
      <div className={styles.container}>
        <div className={`${styles.loginCard} fade-in`} style={{ maxWidth: '500px' }}>
          <h1 className={styles.title}>Chat;Noir</h1>
          <p className={styles.subtitle}>Upload Scenario Files to Play</p>
          
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
              style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid var(--glass-border)', borderRadius: '8px', fontFamily: 'inherit' }}
            >
              <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (-preview)</option>
              <option value="gemini-3.0-flash-preview">Gemini 3.0 Flash (-preview)</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (安定・推奨)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (高精度・推理強)</option>
            </select>

            <button 
              onClick={loadDefaultScenario}
              style={{ padding: '0.8rem', background: 'var(--glass-bg)', color: 'var(--text-main)', border: '1px dashed var(--accent-red)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s' }}
            >
              ⚡ サンプル「歯車仕掛けの手紙」を自動セット
            </button>
            
            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--accent-red)', marginBottom: '0.5rem' }}>必須: GMルール.md {gmRuleText ? '✅ セット済' : ''}</p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setGmRuleText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--accent-red)', marginBottom: '0.5rem' }}>必須: シナリオ設定ファイル.md {scenarioText ? '✅ セット済' : ''}</p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setScenarioText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>任意: 概要ファイル.md（サイドバー表示用） {briefingText ? '✅ セット済' : ''}</p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setBriefingText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', marginTop: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>任意: プロローグファイル.md（初回開始用） {prologueText ? '✅ セット済' : ''}</p>
              <input type="file" accept=".md,.txt" onChange={(e) => handleFileRead(e, setPrologueText)} style={{color: 'var(--text-muted)', fontSize: '0.8rem'}} />
            </div>

            <button 
              className={styles.btn} 
              onClick={handleStartLogin}
              style={{ opacity: (!apiKey || !gmRuleText || !scenarioText) ? 0.5 : 1 }}
            >
              Start Protocol
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- ゲーム画面（プレイング 兼 ブリーフィング） ---
  return (
    <div className={`${styles.gameLayout} fade-in`}>
      <main className={styles.mainChat}>
        <div className={styles.chatHistory} ref={scrollRef}>
          
          {/* ブリーフィング（導入）画面 */}
          {gameState === 'BRIEFING' && (
            <div className="fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '2rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent-red)', marginBottom: '2rem', textAlign: 'center', letterSpacing: '4px', borderBottom: 'none' }}>
                INTRODUCTION - 概要
              </h2>
              <div className="markdown-body" style={{ background: 'var(--glass-bg)', padding: '3rem 4rem', borderRadius: '12px', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
                {briefingText ? (
                  <ReactMarkdown>{briefingText}</ReactMarkdown>
                ) : (
                  <p>（※読み込まれた概要ファイルはありません）</p>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                <button 
                  className={styles.btn} 
                  onClick={startInitialChat}
                  style={{ padding: '1.2rem 4rem', fontSize: '1.2rem', background: 'var(--accent-red)', color: '#fff', border: 'none', boxShadow: '0 0 15px var(--accent-glow)' }}
                >
                  物語を開始する
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
                className="fade-in"
                style={{ 
                  marginBottom: '2.5rem',
                  color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--text-main)',
                  fontStyle: msg.role === 'user' ? 'italic' : 'normal'
                }}
              >
                {msg.role === 'user' && <span>＞ </span>}
                <div className="markdown-body" style={{ display: msg.role === 'user' ? 'inline-block' : 'block', width: '100%' }}>
                  <ReactMarkdown>{msg.parts[0].text.replace(/\\n/g, '\n')}</ReactMarkdown>
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="fade-in" style={{ color: 'var(--accent-red)', opacity: 0.7, marginTop: '2rem' }}>
              システム（GM）が思考中...
            </div>
          )}
        </div>
        
        {/* 入力欄（ブリーフィング中は操作不可） */}
        <div className={styles.inputArea} style={{ opacity: gameState === 'BRIEFING' ? 0.3 : 1, pointerEvents: gameState === 'BRIEFING' ? 'none' : 'auto' }}>
          
          {/* 特殊コマンドUI（裏側でJSONを受け取りサイドバーを更新） */}
          <div style={{ display: 'flex', gap: '0.8rem', position: 'absolute', top: '-40px', left: '15%', alignItems: 'center' }}>
             <button 
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--text-muted)', color: 'var(--text-main)', padding: '5px 15px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', transition: '0.3s' }}
               title="探偵手帳（サイドバー）を開閉"
             >
                {isSidebarOpen ? '📚 手帳を閉じる' : '📖 手帳を開く'}
             </button>
             <button 
               onClick={() => setInputText("※GMへ：")}
               style={{ background: 'var(--glass-bg)', border: '1px dashed #f39c12', color: '#f39c12', padding: '5px 15px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', transition: '0.3s' }}
               title="世界の外からGM（システム）にメタな質問・指示をします"
             >
                💬 GMへ質問
             </button>
             <button 
               onClick={() => requestSpecialCommand('characters')}
               disabled={isLoading}
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: '5px 15px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', opacity: isLoading ? 0.5 : 1}}
             >
              👥 [人物情報] を更新
             </button>
             <button 
               onClick={() => requestSpecialCommand('facts')}
               disabled={isLoading}
               style={{ background: 'var(--glass-bg)', border: '1px solid #4a90e2', color: '#4a90e2', padding: '5px 15px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', opacity: isLoading ? 0.5 : 1}}
             >
              🔎 [事実確認] を更新
             </button>
          </div>

          <input 
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
      </main>

      {/* サイドバー（初期情報 ＋ 抽出された特殊コマンド情報） */}
      <aside className={styles.sidebar} style={{ width: isSidebarOpen ? '380px' : '0px', padding: isSidebarOpen ? '3rem 2rem' : '0', overflowY: isSidebarOpen ? 'auto' : 'hidden', overflowX: 'hidden', borderLeft: isSidebarOpen ? '1px solid var(--glass-border)' : 'none', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: isSidebarOpen ? 1 : 0 }}>
         <div className={styles.sidebarSection} style={{ paddingRight: '0.5rem', whiteSpace: 'pre-wrap' }}>
          <h3 style={{ fontSize: '1rem' }}>📝 Briefing (初期情報)</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.6' }} className="markdown-body">
            {briefingText ? (
              <ReactMarkdown>{briefingText}</ReactMarkdown>
            ) : (
              <p>※概要ファイルが読み込まれていません。</p>
            )}
          </div>
        </div>

        {/* 人物情報JSONを展開 */}
        {charactersData.length > 0 && (
          <div className={styles.sidebarSection}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--accent-red)', borderBottom: '1px solid rgba(209, 26, 42, 0.3)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              👥 現在の人物情報
            </h3>
            <ul className={styles.sidebarList}>
              {charactersData.map((c, i) => (
                <li key={i} className={styles.sidebarItem} style={{ flexDirection: 'column' }}>
                  <strong style={{ color: 'var(--accent-red)' }}>{c.name}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{c.info}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 事実と謎JSONを展開 */}
        {factsData.length > 0 && (
          <div className={styles.sidebarSection}>
            <h3 style={{ fontSize: '0.9rem', color: '#4a90e2', borderBottom: '1px solid rgba(74, 144, 226, 0.3)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              🔎 判明した事実
            </h3>
            <ul className={styles.sidebarList}>
              {factsData.map((f, i) => <li key={i} className={styles.sidebarItem} style={{fontSize: '0.85rem'}}>{f}</li>)}
            </ul>
            
            {mysteriesData.length > 0 && (
              <>
                <h3 style={{ fontSize: '0.9rem', color: '#e24a4a', borderBottom: '1px solid rgba(226, 74, 74, 0.3)', paddingBottom: '0.5rem', marginTop: '1.5rem', marginBottom: '1rem' }}>
                  ❓ 未解決の謎
                </h3>
                <ul className={styles.sidebarList}>
                  {mysteriesData.map((m, i) => <li key={i} className={styles.sidebarItem} style={{ color: '#e24a4a', fontSize: '0.85rem' }}>{m}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
