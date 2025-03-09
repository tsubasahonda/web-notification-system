# Web通知システム検証環境

このプロジェクトは、Web通知システムの検証環境です。Next.jsクライアントとNode.js GraphQLサーバーで構成されています。

## 機能

- Service Workerによるバックグラウンド通知の受信
- GraphQL Subscriptionによるリアルタイム通知
- LocalStorageを使用した通知履歴の管理
- プッシュ通知のサブスクリプション
- Webアプリケーションが閉じられていても通知を受信

## セットアップ手順

### 前提条件

- Node.js (v14以上)
- npm または yarn

### インストール

1. リポジトリをクローンする
   ```bash
   git clone https://github.com/tsubasahonda/web-notification-system.git
   cd web-notification-system
   ```

2. サーバーの依存関係をインストール
   ```bash
   cd server
   npm install
   # または
   yarn install
   ```

3. クライアントの依存関係をインストール
   ```bash
   cd ../client
   npm install
   # または
   yarn install
   ```

### 実行方法

1. サーバーを起動
   ```bash
   cd server
   npm run dev
   # または
   yarn dev
   ```

2. クライアントを起動
   ```bash
   cd ../client
   npm run dev
   # または
   yarn dev
   ```

3. ブラウザで以下のURLにアクセス
   - クライアント: `http://localhost:3000`
   - GraphQL Playground: `http://localhost:4000/graphql`

## 使用方法

1. クライアントページにアクセスする
2. 「通知を有効にする」ボタンをクリックして通知の許可を与える
3. 「テスト通知を送信」ボタンをクリックして通知をテストする
4. ブラウザを閉じても通知が届くことを確認する

## GraphQLクエリの例

### 通知の取得
```graphql
query {
  getNotifications {
    id
    title
    body
    type
    createdAt
  }
}
```

### 通知の送信
```graphql
mutation {
  sendNotification(input: {
    title: "テスト通知"
    body: "これはテスト通知です"
    type: "info"
    metadata: {
      url: "/"
    }
  }) {
    id
    title
    body
  }
}
```

### 通知サブスクリプション
```graphql
subscription {
  notificationReceived {
    id
    title
    body
    type
    createdAt
    metadata {
      url
      imageUrl
    }
  }
}
```

## 注意事項

- このプロジェクトはHTTPS環境で動作させることを推奨します（Service Workerの機能をフルに活用するため）
- 開発環境ではHTTPでも動作しますが、本番環境ではHTTPSが必要です
- プッシュ通知は開発環境でも機能しますが、本番環境では適切なVAPIDキーの設定が必要です

## トラブルシューティング

- **通知が表示されない場合**: ブラウザの通知設定を確認してください
- **Service Workerが登録されない場合**: ブラウザのコンソールを確認し、エラーメッセージを確認してください
- **GraphQL接続エラー**: サーバーが起動しているか、また正しいURLにアクセスしているか確認してください

## ライセンス

MIT
