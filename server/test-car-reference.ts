/**
 * 車関連の共有ナレッジ参照テスト
 */

const BASE_URL = 'http://localhost:3001';

// 類似質問のテストケース
const TEST_QUESTIONS = [
  '東京駅の近くにトヨタのお店ある？',          // → 近くのトヨタディーラー
  'フィットって燃費いいの？',                   // → ホンダ フィットの燃費
  'EV充電できる場所を探してる',                // → 近くのEV充電スポット
  'ハイブリッドのバッテリーって何年もつ？',    // → ハイブリッド車のバッテリー寿命
  '車検っていくらかかる？',                    // → 車検の費用
];

async function testCarReference() {
  console.log('='.repeat(60));
  console.log('車関連の共有ナレッジ参照テスト');
  console.log('='.repeat(60));

  const status = await fetch(`${BASE_URL}/api/rag/status`).then(r => r.json());
  console.log(`\n現在の共有会話数: ${status.sharedConversationsCount}\n`);

  for (const question of TEST_QUESTIONS) {
    console.log('-'.repeat(60));
    console.log(`質問: "${question}"`);
    console.log('サーバーログで "Shared knowledge results" を確認...\n');

    // 会話を作成
    const convResp = await fetch(`${BASE_URL}/api/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'テスト' }),
    });
    const convData = await convResp.json();

    // 質問を送信
    const msgResp = await fetch(`${BASE_URL}/api/chat/conversations/${convData.conversation.id}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: question }),
    });

    // レスポンスの最初の200文字を表示
    const reader = msgResp.body?.getReader();
    const decoder = new TextDecoder();
    let response = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const matches = chunk.match(/"content":"([^"]+)"/g);
        if (matches) {
          matches.forEach(m => {
            response += m.replace(/"content":"/, '').replace(/"$/, '');
          });
        }
      }
    }

    console.log(`回答（最初の150文字）:\n${response.slice(0, 150)}...\n`);

    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('='.repeat(60));
  console.log('テスト完了 - サーバーログを確認してください');
  console.log('='.repeat(60));
}

testCarReference().catch(console.error);
