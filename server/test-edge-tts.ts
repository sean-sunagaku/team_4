import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

async function testEdgeTTS() {
  console.log('Testing Edge TTS connection...');
  
  const requestId = randomUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();
  const text = 'こんにちは、テストです。';
  const voice = 'ja-JP-NanamiNeural';
  
  const wsUrl = `${EDGE_TTS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${requestId}`;
  console.log('Connecting to:', wsUrl);
  
  return new Promise((resolve) => {
    const audioChunks: Buffer[] = [];
    let resolved = false;
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    });
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        console.log('TIMEOUT - No response in 10 seconds');
        resolve(false);
      }
    }, 10000);
    
    ws.on('open', () => {
      console.log('WebSocket connected!');
      
      const configMessage = `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMessage);
      console.log('Config sent');
      
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP"><voice name="${voice}"><prosody rate="+0%" pitch="+0Hz" volume="+0%">${text}</prosody></voice></speak>`;
      const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMessage);
      console.log('SSML sent');
    });
    
    ws.on('message', (data: Buffer | string) => {
      if (resolved) return;
      
      if (Buffer.isBuffer(data)) {
        console.log('Received binary data:', data.length, 'bytes');
        const headerEndIndex = data.indexOf(Buffer.from('Path:audio\r\n'));
        if (headerEndIndex !== -1) {
          const audioStart = data.indexOf(Buffer.from('\r\n\r\n'), headerEndIndex);
          if (audioStart !== -1) {
            const audioData = data.slice(audioStart + 4);
            if (audioData.length > 0) {
              audioChunks.push(audioData);
              console.log('Audio chunk:', audioData.length, 'bytes');
            }
          }
        }
      } else {
        const message = data.toString();
        console.log('Received text:', message.slice(0, 100));
        
        if (message.includes('Path:turn.end')) {
          clearTimeout(timeout);
          resolved = true;
          ws.close();
          
          const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
          console.log('SUCCESS! Total audio size:', totalSize, 'bytes');
          resolve(true);
        }
      }
    });
    
    ws.on('error', (error) => {
      console.log('WebSocket error:', error.message);
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        resolve(false);
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log('WebSocket closed:', code, reason.toString());
    });
  });
}

testEdgeTTS().then((success) => {
  console.log('Test result:', success ? 'PASSED' : 'FAILED');
  process.exit(success ? 0 : 1);
});
