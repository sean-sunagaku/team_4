import { tts, getVoices } from 'edge-tts';

async function testEdgeTTS() {
  console.log('Testing edge-tts package...');
  
  try {
    // 音声データを取得
    const audio = await tts('こんにちは、テストです。', {
      voice: 'ja-JP-NanamiNeural',
    });
    
    console.log('SUCCESS! Audio buffer length:', audio.length, 'bytes');
    return true;
  } catch (error) {
    console.error('Error:', error);
    return false;
  }
}

testEdgeTTS().then((success) => {
  console.log('Test result:', success ? 'PASSED' : 'FAILED');
  process.exit(success ? 0 : 1);
});
