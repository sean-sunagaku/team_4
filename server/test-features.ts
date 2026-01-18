/**
 * Test script for location and car search features
 */

async function testFeatures() {
  const BASE_URL = 'http://localhost:3001';

  console.log('=== Testing Location & Car Search Features ===\n');

  // Test 1: RAG Status
  console.log('1. Testing RAG Status...');
  try {
    const resp = await fetch(`${BASE_URL}/api/rag/status`);
    const data = await resp.json();
    console.log('   RAG Status:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('   Error:', e);
  }

  // Test 2: Create conversation
  console.log('\n2. Creating test conversation...');
  let conversationId: string | null = null;
  try {
    const resp = await fetch(`${BASE_URL}/api/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'テスト会話' }),
    });
    const data = await resp.json();
    conversationId = data.conversation?.id;
    console.log('   Conversation ID:', conversationId);
  } catch (e) {
    console.log('   Error:', e);
  }

  if (!conversationId) {
    console.log('   Failed to create conversation, exiting...');
    return;
  }

  // Test 3: Send message with location (location-based search)
  console.log('\n3. Testing location-based search (近くのトヨタディーラー)...');
  try {
    const resp = await fetch(`${BASE_URL}/api/chat/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '近くのトヨタディーラーを教えて',
        location: { lat: 35.6762, lng: 139.6503 }, // 東京駅
      }),
    });

    const reader = resp.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }
      // Extract first 500 chars of response
      console.log('   Response (first 500 chars):', result.slice(0, 500));
    }
  } catch (e) {
    console.log('   Error:', e);
  }

  // Test 4: Send message with car brand (car search)
  console.log('\n4. Testing car search (ホンダ フィットの燃費)...');
  try {
    const resp = await fetch(`${BASE_URL}/api/chat/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'ホンダ フィットの燃費はどれくらい？',
      }),
    });

    const reader = resp.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }
      console.log('   Response (first 500 chars):', result.slice(0, 500));
    }
  } catch (e) {
    console.log('   Error:', e);
  }

  console.log('\n=== Tests Complete ===');
}

testFeatures();
