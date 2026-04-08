import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text, type, command } = await req.json();
    
    console.log("\n--- [AI 暴走/解析エラー検知] ---");
    if (type === 'JSON_ERROR') {
      console.warn(`🚨 【手帳命令: ${command}】 JSON解析に失敗しました。`);
    } else {
      console.warn(`🚨 通常の文章生成でルール違反（暴走）を検知しました。`);
    }
    console.log("▼ 受信テキスト:\n", text);
    console.log("-------------------------------\n");

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
