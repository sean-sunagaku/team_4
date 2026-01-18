/**
 * 登録された会話を確認するスクリプト
 */

const BASE_URL = 'http://localhost:3001';

async function checkConversations() {
  console.log('=== 登録された会話を確認 ===\n');

  // 会話一覧を取得
  const resp = await fetch(`${BASE_URL}/api/chat/conversations`);
  const data = await resp.json();
  const conversations = data.conversations;

  console.log(`総会話数: ${conversations.length}\n`);

  // 最新20件を表示
  console.log('--- 最新20件の会話 ---');
  for (let i = 0; i < Math.min(20, conversations.length); i++) {
    const conv = conversations[i];
    console.log(`\n[${i + 1}] ID: ${conv.id}`);
    console.log(`    タイトル: ${conv.title || '(なし)'}`);
    console.log(`    作成日時: ${conv.createdAt}`);

    // メッセージを取得
    const convResp = await fetch(`${BASE_URL}/api/chat/conversations/${conv.id}`);
    const convData = await convResp.json();
    const messages = convData.conversation.messages || [];

    console.log(`    メッセージ数: ${messages.length}`);
    if (messages.length > 0) {
      // 最初のユーザーメッセージを表示
      const userMsg = messages.find((m: any) => m.role === 'user');
      const assistantMsg = messages.find((m: any) => m.role === 'assistant');

      if (userMsg) {
        console.log(`    User: ${userMsg.content.slice(0, 50)}...`);
      }
      if (assistantMsg) {
        console.log(`    Assistant: ${assistantMsg.content.slice(0, 50)}...`);
      }
    }
  }

  console.log('\n=== 確認完了 ===');
}

checkConversations().catch(console.error);
