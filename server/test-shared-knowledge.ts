/**
 * 共有ナレッジ機能のテストスクリプト
 *
 * 実行方法: bun run test-shared-knowledge.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSharedKnowledge() {
  console.log('='.repeat(60));
  console.log('共有ナレッジ機能テスト開始');
  console.log('='.repeat(60));

  // Step 1: 初期状態確認
  console.log('\n📊 Step 1: 初期状態確認');
  const initialStatus = await fetch(`${BASE_URL}/api/rag/status`).then(r => r.json());
  console.log('初期状態:', JSON.stringify(initialStatus, null, 2));
  console.log(`- 取扱説明書ドキュメント数: ${initialStatus.documentCount}`);
  console.log(`- 共有会話数: ${initialStatus.sharedConversationsCount}`);
  console.log(`- キャッシュサイズ: ${initialStatus.similarityCacheSize}`);

  // Step 2: 新しい会話を作成
  console.log('\n📝 Step 2: 新しい会話を作成');
  const convResponse = await fetch(`${BASE_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'テスト会話' })
  }).then(r => r.json());
  const conversationId = convResponse.conversation.id;
  console.log(`会話ID: ${conversationId}`);

  // Step 3: 説明書にない質問を送信（例：一般的な質問）
  console.log('\n💬 Step 3: 説明書にない質問を送信');
  const testQuestion = 'バナナの美味しい食べ方を教えて';
  console.log(`質問: "${testQuestion}"`);

  const streamResponse = await fetch(`${BASE_URL}/api/chat/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: testQuestion })
  });

  // ストリーミングレスポンスを読み取る
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullResponse += data.content;
              process.stdout.write(data.content);
            } else if (data.type === 'done') {
              console.log('\n');
            }
          } catch {}
        }
      }
    }
  }

  // Step 4: RAG登録を待つ
  console.log('\n⏳ Step 4: RAG登録を待機中（3秒）...');
  await sleep(3000);

  // Step 5: 状態確認
  console.log('\n📊 Step 5: RAG登録後の状態確認');
  const afterFirstStatus = await fetch(`${BASE_URL}/api/rag/status`).then(r => r.json());
  console.log(`- 共有会話数: ${initialStatus.sharedConversationsCount} → ${afterFirstStatus.sharedConversationsCount}`);
  console.log(`- キャッシュサイズ: ${initialStatus.similarityCacheSize} → ${afterFirstStatus.similarityCacheSize}`);

  if (afterFirstStatus.sharedConversationsCount > initialStatus.sharedConversationsCount) {
    console.log('✅ 会話がRAGに登録されました！');
  } else {
    console.log('⚠️ 会話がRAGに登録されていない可能性があります');
  }

  // Step 6: 類似の質問を送信（キャッシュ or 共有ナレッジからの回答を期待）
  console.log('\n💬 Step 6: 類似の質問を送信');
  const similarQuestion = 'バナナの美味しい食べ方は？';
  console.log(`質問: "${similarQuestion}"`);

  // 新しい会話を作成
  const conv2Response = await fetch(`${BASE_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'テスト会話2' })
  }).then(r => r.json());
  const conversationId2 = conv2Response.conversation.id;

  const startTime = Date.now();
  const streamResponse2 = await fetch(`${BASE_URL}/api/chat/conversations/${conversationId2}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: similarQuestion })
  });

  const reader2 = streamResponse2.body?.getReader();
  let fullResponse2 = '';
  let isCached = false;

  if (reader2) {
    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullResponse2 += data.content;
              process.stdout.write(data.content);
            } else if (data.type === 'done') {
              if (data.cached) {
                isCached = true;
              }
              console.log('\n');
            }
          } catch {}
        }
      }
    }
  }

  const responseTime = Date.now() - startTime;
  console.log(`応答時間: ${responseTime}ms`);

  if (isCached) {
    console.log('✅ キャッシュからの応答でした！（高速）');
  } else {
    console.log('ℹ️ 新規生成の応答でした（共有ナレッジが参照された可能性あり - サーバーログを確認）');
  }

  // Step 7: 最終状態確認
  console.log('\n📊 Step 7: 最終状態確認');
  await sleep(2000);
  const finalStatus = await fetch(`${BASE_URL}/api/rag/status`).then(r => r.json());
  console.log('最終状態:', JSON.stringify(finalStatus, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('テスト完了');
  console.log('='.repeat(60));
  console.log('\n📋 確認ポイント:');
  console.log('1. sharedConversationsCount が増加しているか');
  console.log('2. サーバーログに "Conversation added to RAG" が表示されているか');
  console.log('3. 類似質問時に "Shared knowledge results added to context" が表示されているか');
  console.log('4. 同一質問時に "Similarity cache hit" が表示されているか');
}

testSharedKnowledge().catch(console.error);

export {};
