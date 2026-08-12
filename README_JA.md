# 個人燃費記録

個人の1台の車向けに作られた、モバイル優先・ローカル優先の燃費記録アプリです。

業務データは現在のブラウザーの IndexedDB に直接保存されます。給油記録、削除、統計、JSON バックアップの入出力に、サーバー、アカウント、ログイン、SQLite、クラウドサービスは必要ありません。

## 機能

- 走行距離、支払金額、単価、日付、満タンかどうかを記録
- `金額 / 単価` から給油量を計算
- full-to-full 方式で実燃費とコストを計算
- 記録削除後にすべての統計を再計算
- schemaVersion 1 JSON バックアップをローカルで入出力
- 旧サーバー版の schemaVersion 1 バックアップをインポート可能

データは現在の端末だけに保存されます。定期的にバックアップをエクスポートし、ブラウザーデータの削除や将来の APK のアンインストール前には必ずバックアップしてください。

## 開発

Node.js 22.6 以上が必要です。

```bash
npm install
npm test
npm run lint
npm run dev
```

データベースや認証用の環境変数は不要です。`npm run dev` はローカル開発専用です。

完全な静的 production artifact は次で生成します：

```bash
npm run build
```

結果は `out/` に生成され、通常の静的ファイルサーバーで配信できます。production では `next start` を使用せず、Node.js server、database、environment variables、server API は不要です。

ビルド後の一時 preview：

```bash
python -m http.server 8000 --directory out
```

Capacitor と Android APK packaging は後続フェーズであり、この変更には含みません。

## 技術構成

- Next.js + React + TypeScript
- IndexedDB LocalRepository
- 純粋な TypeScript の燃費・バックアップロジック
- モバイル向け Material スタイル UI

## ライセンス

この fork は `jyh9521/fuel-tracker` の MIT ライセンスと原作者表記を引き継ぎます。
