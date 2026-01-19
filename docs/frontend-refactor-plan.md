# フロントエンド表示分割の実装計画書

## 目的
- 現状の挙動は変えず、`App.tsx` 内の大きな JSX ブロックを表示コンポーネントとして分割する。
- ロジック分離は行わず、表示のみを分離する。

## 分割対象
- 左パネル（非ナビ時）: ミッション + 運転サポート
- 左パネル（ナビ中）: ミッション + AI相談 + 運転サポート
- 中央マップ
- 右パネル（Google Maps 起動 + QR）
- モーダルは現行の `NavigationStartModal` を継続利用

## 新規ファイル案（表示専用）
1) `client/src/components/MissionListPanel.tsx`
   - ミッション一覧の表示
   - Props: `steps: string[]`

2) `client/src/components/LeftPanel.tsx`
   - 左側レイアウトの表示組み立て
   - Props: `isNavigating`, `missionSteps`, `onStartNavigation`

3) `client/src/components/MapPanel.tsx`
   - GoogleMap の表示のみ
   - Props: `currentLocation`, `directions`

4) `client/src/components/NavigationActionPanel.tsx`
   - Google Maps 起動ボタン + QR セクション
   - Props: `googleMapsNavUrl`, `qrUrl`, `onQrUrlChange`, `onOpenGoogleMaps`

## 作業手順
1) `MissionListPanel` を作成し、ミッション描画を移動
2) 左側 JSX を `LeftPanel` に移動（条件分岐はコンポーネント内で処理）
3) 中央地図 JSX を `MapPanel` に移動
4) 右側の QR/ボタンを `NavigationActionPanel` に移動
5) `App.tsx` は組み立てのみ残し、表示責務は移譲

## 影響/確認観点
- `isNavigating` による表示切替が変わらない
- ミッションリスト表示が同一
- Google Maps ボタンとポップアップ挙動が同じ
- QR 入力とリンク生成の挙動が同じ

