# aiChat

AI 音声ボタン周りの表示とロジックをまとめたディレクトリ。

## 処理の大きな流れ
1) **待機開始**
   - `alwaysListen` が true の場合は WebSocket ASR に接続して wake word 待機
   - false の場合はタップで録音開始

2) **録音**
   - MediaRecorder で音声を収録
   - RMS を使った無音検知で自動停止
   - 録音が短すぎる場合は破棄して待機へ

3) **送信**
   - 録音した Blob を Base64 に変換
   - `/api/voice/chat` に送信してレスポンスを待つ

4) **再生**
   - サーバーTTSの音声URLは順序再生キューに積んで再生
   - 低遅延のために Browser TTS も併用（テキストキュー）

5) **復帰**
   - 再生完了後、`alwaysListen` が true なら待機へ戻る
   - それ以外は idle に戻る

## 主要な役割
- `AIChatButton.tsx`: 状態遷移の司令塔（待機→録音→送信→再生→復帰）
- `useWakeWordListener.ts`: wake word 待受（WebSocket ASR）
- `useAudioRecorder.ts`: 録音/無音検知/録音完了時の送信
- `useAudioQueue.ts`: サーバーTTSの順序再生
- `useBrowserTtsQueue.ts`: Browser TTSの順序再生
- `AIChatButtonView.tsx`: UI 表示専用
- `aiChatUtils.ts`: 変換/通知音などの補助
- `aiChatConstants.ts`: しきい値定義

