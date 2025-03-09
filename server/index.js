// server/index.js
const express = require("express");
const { createServer } = require("http");
const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const {
  ApolloServerPluginDrainHttpServer,
} = require("@apollo/server/plugin/drainHttpServer");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const { WebSocketServer } = require("ws");
const { useServer } = require("graphql-ws/lib/use/ws");
const bodyParser = require("body-parser");
const cors = require("cors");
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

// GraphQL型定義
const typeDefs = `
  type Notification {
    id: ID!
    title: String!
    body: String!
    type: String
    createdAt: String!
    metadata: NotificationMetadata
  }

  type NotificationMetadata {
    url: String
    imageUrl: String
    priority: String
    category: String
  }

  input NotificationInput {
    title: String!
    body: String!
    type: String
    metadata: NotificationMetadataInput
  }

  input NotificationMetadataInput {
    url: String
    imageUrl: String
    priority: String
    category: String
  }

  input NotificationSettingsInput {
    enabled: Boolean!
    categories: [String!]
  }

  type NotificationSettingsResponse {
    success: Boolean!
    message: String
  }

  type PushSubscriptionResponse {
    success: Boolean!
    message: String
  }

  type Query {
    getNotifications: [Notification!]!
  }

  type Mutation {
    sendNotification(input: NotificationInput!): Notification!
    updateNotificationSettings(input: NotificationSettingsInput!): NotificationSettingsResponse!
    subscribeToPushNotifications(subscription: String!): PushSubscriptionResponse!
  }

  type Subscription {
    notificationReceived: Notification!
  }
`;

// 通知データストア（実際の実装ではデータベースを使用）
const notificationsStore = [];
// 購読情報を保存するストア
const subscriptionsStore = [];
// Pub/Sub管理用
const pubsub = {
  subscribers: {},
  subscribe(channel, callback) {
    if (!this.subscribers[channel]) {
      this.subscribers[channel] = [];
    }
    this.subscribers[channel].push(callback);
    return () => {
      this.subscribers[channel] = this.subscribers[channel].filter(
        (cb) => cb !== callback
      );
    };
  },
  publish(channel, data) {
    if (!this.subscribers[channel]) {
      return;
    }
    for (const callback of this.subscribers[channel]) {
      callback(data);
    }
  },
};

// リゾルバー関数
const resolvers = {
  Query: {
    getNotifications: () => notificationsStore,
  },
  Mutation: {
    sendNotification: (_, { input }) => {
      const notification = {
        id: Date.now().toString(),
        title: input.title,
        body: input.body,
        type: input.type || "general",
        createdAt: new Date().toISOString(),
        metadata: input.metadata || {},
      };

      notificationsStore.push(notification);

      // サブスクリプションに通知を発行
      pubsub.publish("NOTIFICATION_RECEIVED", {
        notificationReceived: notification,
      });

      // Web Push通知の送信（登録されたクライアントに）
      try {
        for (const subscription of subscriptionsStore) {
          const payload = JSON.stringify({
            title: notification.title,
            body: notification.body,
            data: {
              id: notification.id,
              url: notification.metadata?.url,
              type: notification.type,
              timestamp: notification.createdAt,
            },
          });

          console.log("subscription", subscription.endpoint);

          webpush.sendNotification(subscription, payload).catch((error) => {
            console.error("Push通知の送信に失敗:", error);
            // 古いサブスクリプションを削除
            if (error.statusCode === 410) {
              const index = subscriptionsStore.findIndex(
                (sub) => sub.endpoint === subscription.endpoint
              );
              if (index !== -1) {
                subscriptionsStore.splice(index, 1);
                // サブスクリプションを保存（実際の実装ではデータベースに保存）
                saveSubscriptions();
              }
            }
          });
        }
      } catch (error) {
        console.error("Push通知の処理中にエラーが発生しました:", error);
      }

      return notification;
    },
    updateNotificationSettings: (_, { input }) => {
      // 実際の実装ではユーザーの設定をデータベースに保存
      console.log("通知設定が更新されました:", input);
      return {
        success: true,
        message: "通知設定が更新されました",
      };
    },
    subscribeToPushNotifications: (_, { subscription }) => {
      try {
        const parsedSubscription = JSON.parse(subscription);

        // 既存のサブスクリプションを確認
        const existingSubscription = subscriptionsStore.find(
          (sub) => sub.endpoint === parsedSubscription.endpoint
        );

        // 重複がなければ追加
        if (!existingSubscription) {
          console.log("新しいサブスクリプションを追加:", parsedSubscription);
          subscriptionsStore.push(parsedSubscription);
          // サブスクリプションを保存（実際の実装ではデータベースに保存）
          saveSubscriptions();
        }

        return {
          success: true,
          message: "プッシュ通知の購読に成功しました",
        };
      } catch (error) {
        console.error("プッシュ通知の購読に失敗:", error);
        return {
          success: false,
          message: `プッシュ通知の購読に失敗しました: ${error.message}`,
        };
      }
    },
  },
  Subscription: {
    notificationReceived: {
      subscribe: () => {
        const channel = "NOTIFICATION_RECEIVED";
        // AsyncIteratorの作成
        const asyncIterator = {
          [Symbol.asyncIterator]: async function* () {
            const queue = [];
            let resolve = null;

            const unsubscribe = pubsub.subscribe(channel, (data) => {
              queue.push(data);
              if (resolve) {
                resolve();
                resolve = null;
              }
            });

            try {
              while (true) {
                if (queue.length === 0) {
                  await new Promise((r) => {
                    resolve = r;
                  });
                }
                yield queue.shift();
              }
            } finally {
              unsubscribe();
            }
          },
        };

        return asyncIterator;
      },
    },
  },
};

// VAPIDキーの生成と保存
function generateVapidKeys() {
  const keysPath = path.join(__dirname, "vapid-keys.json");

  // すでにキーが存在するか確認
  if (fs.existsSync(keysPath)) {
    try {
      return JSON.parse(fs.readFileSync(keysPath, "utf8"));
    } catch (error) {
      console.error("VAPIDキーの読み込みに失敗:", error);
    }
  }

  // 新しいキーを生成
  const vapidKeys = webpush.generateVAPIDKeys();

  // キーを保存
  try {
    fs.writeFileSync(keysPath, JSON.stringify(vapidKeys), "utf8");
    console.log("新しいVAPIDキーを生成しました");
  } catch (error) {
    console.error("VAPIDキーの保存に失敗:", error);
  }

  return vapidKeys;
}

// サブスクリプションの保存
function saveSubscriptions() {
  const subscriptionsPath = path.join(__dirname, "subscriptions.json");
  try {
    fs.writeFileSync(
      subscriptionsPath,
      JSON.stringify(subscriptionsStore),
      "utf8"
    );
  } catch (error) {
    console.error("サブスクリプションの保存に失敗:", error);
  }
}

// サブスクリプションの読み込み
function loadSubscriptions() {
  const subscriptionsPath = path.join(__dirname, "subscriptions.json");

  if (fs.existsSync(subscriptionsPath)) {
    try {
      const data = fs.readFileSync(subscriptionsPath, "utf8");
      const subscriptions = JSON.parse(data);
      subscriptionsStore.push(...subscriptions);
      console.log(
        `${subscriptions.length}件のサブスクリプションを読み込みました`
      );
    } catch (error) {
      console.error("サブスクリプションの読み込みに失敗:", error);
    }
  }
}

async function startServer() {
  // Express アプリケーションの作成
  const app = express();

  // HTTPサーバーの作成
  const httpServer = createServer(app);

  // CORSの設定（すべてのエンドポイントに適用）
  app.use(
    cors({
      origin: ["http://localhost:3000", "http://localhost:8080"], // クライアントのオリジン
      credentials: true,
    })
  );

  // JSON解析ミドルウェアを設定
  app.use(bodyParser.json());

  // VAPIDキーの設定
  const vapidKeys = generateVapidKeys();
  webpush.setVapidDetails(
    "mailto:example@example.com", // 実際の環境に合わせて変更
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // サブスクリプションの読み込み
  loadSubscriptions();

  // GraphQLスキーマの作成
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // WebSocketサーバーの設定
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  // WebSocketサーバーの実行
  const serverCleanup = useServer({ schema }, wsServer);

  // ApolloServerの作成
  const server = new ApolloServer({
    schema,
    plugins: [
      // HTTPサーバーの適切なシャットダウンを保証
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // WebSocketサーバーの適切なシャットダウンを保証
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  // サーバーの起動
  await server.start();

  // GraphQLエンドポイントの設定
  app.use("/graphql", expressMiddleware(server));

  // VAPIDの公開キーを提供するエンドポイント
  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // テスト用のプッシュ通知エンドポイント
  app.post("/api/send-notification", (req, res) => {
    try {
      const { title, body, url } = req.body;

      if (!title || !body) {
        return res.status(400).json({ error: "タイトルと本文は必須です" });
      }

      // GraphQLミューテーションを内部で実行
      const notification = resolvers.Mutation.sendNotification(null, {
        input: {
          title,
          body,
          type: "test",
          metadata: {
            url: url || null,
          },
        },
      });

      res.json({ success: true, notification });
    } catch (error) {
      console.error("通知の送信に失敗:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // サブスクリプション登録用エンドポイント
  app.post("/api/notifications/subscribe", (req, res) => {
    try {
      const subscription = req.body;

      // GraphQLミューテーションを内部で実行
      const result = resolvers.Mutation.subscribeToPushNotifications(null, {
        subscription: JSON.stringify(subscription),
      });

      res.json(result);
    } catch (error) {
      console.error("サブスクリプションの登録に失敗:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 静的ファイルの提供（開発用）
  app.use(express.static(path.join(__dirname, "public")));

  // ポート番号の設定
  const PORT = process.env.PORT || 4000;

  // サーバーの起動
  httpServer.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    console.log(`GraphQLエンドポイント: http://localhost:${PORT}/graphql`);
    console.log(`WebSocket エンドポイント: ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch((err) => {
  console.error("サーバーの起動に失敗しました:", err);
});
