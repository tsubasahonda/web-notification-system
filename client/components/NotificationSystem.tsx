import React, { useState, useEffect, useRef } from "react";
import { useQuery, gql } from "@apollo/client";
import {
  type Notification,
  getNotificationHistory,
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPushNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearNotificationHistory,
  sendTestNotification,
} from "@/utils/notification";

// 通知サブスクリプションのGraphQLクエリ
const NOTIFICATION_SUBSCRIPTION = gql`
  subscription OnNewNotification {
    notificationReceived {
      id
      title
      body
      type
      createdAt
      metadata {
        url
        imageUrl
        priority
        category
      }
    }
  }
`;

// メインの通知コンポーネント
const NotificationSystem: React.FC = () => {
  // 状態管理
  const swInitializedRef = useRef(false);
  const testIdRef = useRef<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [serviceWorkerRegistered, setServiceWorkerRegistered] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  // 疎通確認用の状態
  const [connectionStatus, setConnectionStatus] = useState({
    serverHttp: "未確認",
    serverWs: "未確認",
    serviceWorker: "未確認",
    serverToSw: "未確認",
  });
  const [connectionTestRunning, setConnectionTestRunning] = useState(false);

  // GraphQLサブスクリプション
  // Apolloクライアントで通知サブスクリプションを使用
  const { data, loading, error } = useQuery(
    gql`
      query GetNotifications {
        getNotifications {
          id
          title
          body
        }
      }
    `,
    {
      fetchPolicy: "network-only",
    }
  );

  // マウント時の初期化
  useEffect(() => {
    // LocalStorageから通知履歴を読み込む
    const storedNotifications = getNotificationHistory();
    setNotifications(storedNotifications);
    setUnreadCount(storedNotifications.filter((n) => !n.read).length);

    // 通知権限の確認
    checkNotificationPermission();

    // Service Workerの登録
    if (!swInitializedRef.current) {
      initServiceWorker();
      swInitializedRef.current = true;
    }

    // メッセージリスナーを設定
    setupMessageListeners();

    return () => {
      // クリーンアップ
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage
        );
      }
    };
  }, []);

  // GraphQLサブスクリプションによる通知データの取得（デモ用）
  useEffect(() => {
    if (data && data.getNotifications) {
      console.log("GraphQLから取得した通知データ:", data.getNotifications);
    }
  }, [data]);

  // 通知権限の確認
  const checkNotificationPermission = () => {
    if ("Notification" in window) {
      setPermissionGranted(Notification.permission === "granted");
    }
  };

  // Service Workerの初期化
  const initServiceWorker = async () => {
    try {
      const registration = await registerServiceWorker();

      if (registration) {
        setServiceWorkerRegistered(true);

        // プッシュ通知の許可があれば自動的にサブスクライブ
        if (Notification.permission === "granted") {
          const subscription = await subscribeToPushNotifications(registration);
          if (subscription) {
            console.log(
              "successfully subscribed to push notifications",
              subscription.endpoint
            );
            setSubscribed(true);
          }
        }
      }
    } catch (error) {
      console.error("Service Workerの初期化に失敗:", error);
    }
  };

  // Service Workerからのメッセージを処理
  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data) {
      console.log("Service Workerからメッセージを受信:", event.data);

      // 通知の保存
      if (event.data.type === "SAVE_NOTIFICATION") {
        const { notification } = event.data;
        handleNewNotification(notification);
      }

      // 通知クリック
      if (event.data.type === "NOTIFICATION_CLICKED") {
        const { notification } = event.data;

        // 通知IDがあれば既読にする
        if (notification && notification.data && notification.data.id) {
          handleMarkAsRead(notification.data.id);
        }
      }

      // サーバー→Service Worker疎通テスト応答
      if (event.data.type === "SERVER_SW_CONNECTION_TEST_RESPONSE") {
        console.log(
          "SERVER_SW_CONNECTION_TEST_RESPONSE:",
          event.data.testId,
          testIdRef.current
        );
        if (event.data.testId === testIdRef.current) {
          console.log("サーバー→Service Worker疎通テスト成功:", event.data);
          setConnectionStatus((prev) => ({
            ...prev,
            serverToSw: `接続成功 (${Math.round(
              event.data.timestamp - event.data.receivedTimestamp
            )}ms) ✅`,
          }));
        } else {
          console.log("古い疎通テスト応答を受信:", event.data);
        }
      }

      // 直接疎通テスト応答
      if (event.data.type === "CONNECTION_TEST_RESPONSE") {
        if (event.data.id === testIdRef.current) {
          console.log("Service Worker疎通テスト成功:", event.data);
        }
      }
    }
  };

  // メッセージリスナーの設定
  const setupMessageListeners = () => {
    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage
    );
  };

  // 新しい通知の処理
  const handleNewNotification = (notification: any) => {
    const storedData = saveNotificationToLocalStorage(notification);
    setNotifications(storedData.history);
    setUnreadCount(storedData.unreadCount);
  };

  // 通知をLocalStorageに保存
  const saveNotificationToLocalStorage = (notification: any) => {
    // 現在の通知履歴を取得
    let history = getNotificationHistory();

    // 新しい通知を先頭に追加
    const newNotification: Notification = {
      id: notification.id || `notification-${Date.now()}`,
      title: notification.title,
      body: notification.body,
      type: notification.type || "default",
      timestamp: notification.timestamp || Date.now(),
      read: false,
      data: notification.data || {},
    };

    // 重複チェック
    const isDuplicate = history.some((n) => n.id === newNotification.id);
    if (!isDuplicate) {
      history.unshift(newNotification);

      // 最大保存数を超えた場合、古いものから削除
      const MAX_NOTIFICATIONS = 50;
      if (history.length > MAX_NOTIFICATIONS) {
        history = history.slice(0, MAX_NOTIFICATIONS);
      }

      // LocalStorageに保存
      localStorage.setItem("notificationHistory", JSON.stringify(history));
    }

    // 未読の通知数を取得
    const unreadCount = history.filter((n) => !n.read).length;

    return { history, unreadCount };
  };

  // 通知の許可を要求
  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermissionGranted(granted);

    if (granted && serviceWorkerRegistered) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await subscribeToPushNotifications(registration);
      if (subscription) {
        setSubscribed(true);
      }
    }
  };

  // テスト通知の送信
  const handleSendTestNotification = async () => {
    try {
      await sendTestNotification();
    } catch (error) {
      console.error("テスト通知の送信に失敗:", error);
      alert("テスト通知の送信に失敗しました");
    }
  };

  // 疎通確認テスト
  const runConnectionTest = async () => {
    setConnectionTestRunning(true);

    // 新しいテストIDを生成
    const newTestId = Date.now().toString();
    testIdRef.current = newTestId;

    setConnectionStatus({
      serverHttp: "テスト中...",
      serverWs: "テスト中...",
      serviceWorker: "テスト中...",
      serverToSw: "テスト中...",
    });

    // HTTP疎通確認
    try {
      const httpResponse = await fetch(
        "http://localhost:4000/api/vapid-public-key",
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (httpResponse.ok) {
        setConnectionStatus((prev) => ({ ...prev, serverHttp: "接続成功 ✅" }));
      } else {
        setConnectionStatus((prev) => ({
          ...prev,
          serverHttp: `接続エラー: ${httpResponse.status} ❌`,
        }));
      }
    } catch (error) {
      console.error("HTTP接続テスト失敗:", error);
      setConnectionStatus((prev) => ({
        ...prev,
        serverHttp: `接続失敗: ${
          error instanceof Error ? error.message : "不明なエラー"
        } ❌`,
      }));
    }

    // WebSocket疎通確認
    try {
      const ws = new WebSocket("ws://localhost:4000/graphql");
      let wsConnected = false;

      // タイムアウト設定
      const wsTimeout = setTimeout(() => {
        if (!wsConnected) {
          setConnectionStatus((prev) => ({
            ...prev,
            serverWs: "タイムアウト ❌",
          }));
          ws.close();
        }
      }, 5000);

      ws.onopen = () => {
        wsConnected = true;
        setConnectionStatus((prev) => ({ ...prev, serverWs: "接続成功 ✅" }));
        clearTimeout(wsTimeout);
        ws.close();
      };

      ws.onerror = (err) => {
        setConnectionStatus((prev) => ({ ...prev, serverWs: "接続失敗 ❌" }));
        clearTimeout(wsTimeout);
      };
    } catch (error) {
      console.error("WS接続テスト失敗:", error);
      setConnectionStatus((prev) => ({
        ...prev,
        serverWs: `接続失敗: ${
          error instanceof Error ? error.message : "不明なエラー"
        } ❌`,
      }));
    }

    // クライアント→Service Worker直接疎通確認
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        // メッセージ送信用のユニークID
        let messageReceived = false;

        // 応答を待つ処理
        const messagePromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (!messageReceived) {
              reject(new Error("タイムアウト"));
            }
          }, 3000);

          const messageHandler = (event: MessageEvent) => {
            if (
              event.data &&
              event.data.type === "CONNECTION_TEST_RESPONSE" &&
              event.data.id === newTestId
            ) {
              messageReceived = true;
              clearTimeout(timeout);
              resolve();
            }
          };

          // 一時的なメッセージリスナーを追加
          const tempListener = (event: MessageEvent) => messageHandler(event);
          navigator.serviceWorker.addEventListener("message", tempListener);

          // プロミス解決時にリスナーを削除するクリーンアップ
          setTimeout(() => {
            navigator.serviceWorker.removeEventListener(
              "message",
              tempListener
            );
          }, 5000);
        });

        // Service Workerにメッセージを送信
        navigator.serviceWorker.controller.postMessage({
          type: "CONNECTION_TEST",
          id: newTestId,
        });

        await messagePromise;
        setConnectionStatus((prev) => ({
          ...prev,
          serviceWorker: "接続成功 ✅",
        }));
      } else {
        setConnectionStatus((prev) => ({
          ...prev,
          serviceWorker: "Service Worker未登録または未アクティブ ❌",
        }));
      }
    } catch (error) {
      console.error("Service Worker接続テスト失敗:", error);
      setConnectionStatus((prev) => ({
        ...prev,
        serviceWorker: `接続失敗: ${
          error instanceof Error ? error.message : "不明なエラー"
        } ❌`,
      }));
    }

    // サーバー→Service Worker疎通確認
    if (permissionGranted && subscribed) {
      try {
        // サーバー経由のテスト通知を送信
        const serverTestResponse = await fetch(
          "http://localhost:4000/api/connection-test",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ testId: newTestId }),
          }
        );

        if (serverTestResponse.ok) {
          const result = await serverTestResponse.json();

          if (result.subscriptionCount === 0) {
            setConnectionStatus((prev) => ({
              ...prev,
              serverToSw: "サブスクリプションがありません ❌",
            }));
          } else {
            // 応答はService Workerからのメッセージイベントで受け取るので、
            // タイムアウト設定のみ行う
            setTimeout(() => {
              setConnectionStatus((prev) => {
                if (prev.serverToSw === "テスト中...") {
                  return { ...prev, serverToSw: "タイムアウト ❌" };
                }
                return prev;
              });
            }, 10000);
          }
        } else {
          setConnectionStatus((prev) => ({
            ...prev,
            serverToSw: `サーバーエラー: ${serverTestResponse.status} ❌`,
          }));
        }
      } catch (error) {
        console.error("サーバー→Service Worker接続テスト失敗:", error);
        setConnectionStatus((prev) => ({
          ...prev,
          serverToSw: `接続失敗: ${
            error instanceof Error ? error.message : "不明なエラー"
          } ❌`,
        }));
      }
    } else {
      setConnectionStatus((prev) => ({
        ...prev,
        serverToSw: "通知許可または購読が必要です ❓",
      }));
    }

    setConnectionTestRunning(false);
  };

  // 通知を既読にする
  const handleMarkAsRead = (id: string) => {
    const result = markNotificationAsRead(id);
    setNotifications(result.history);
    setUnreadCount(result.unreadCount);
  };

  // すべての通知を既読にする
  const handleMarkAllAsRead = () => {
    const result = markAllNotificationsAsRead();
    setNotifications(result.history);
    setUnreadCount(result.unreadCount);
  };

  // 通知を削除する
  const handleDeleteNotification = (id: string) => {
    const result = deleteNotification(id);
    setNotifications(result.history);
    setUnreadCount(result.unreadCount);
  };

  // すべての通知を削除する
  const handleClearAll = () => {
    if (window.confirm("すべての通知を削除してもよろしいですか？")) {
      const result = clearNotificationHistory();
      setNotifications(result.history);
      setUnreadCount(result.unreadCount);
    }
  };

  // 日付のフォーマット
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="card">
      <div className="header">
        <h1>通知センター</h1>
        <div className="notification-bell">
          <svg
            className="bell-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          {unreadCount > 0 && (
            <span className="notification-badge">{unreadCount}</span>
          )}
        </div>
      </div>

      <div className="controls">
        <div>
          <button
            className="btn"
            onClick={handleRequestPermission}
            disabled={permissionGranted && subscribed}
          >
            {permissionGranted && subscribed
              ? "通知は有効です"
              : permissionGranted
              ? "通知サブスクリプションを有効にする"
              : "通知を有効にする"}
          </button>{" "}
          <button
            className="btn btn-secondary"
            onClick={handleSendTestNotification}
          >
            テスト通知を送信
          </button>
        </div>
        <div>
          <button
            className="btn btn-secondary"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
          >
            すべて既読にする
          </button>{" "}
          <button
            className="btn btn-secondary"
            onClick={handleClearAll}
            disabled={notifications.length === 0}
          >
            すべて削除
          </button>
        </div>
      </div>

      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="empty-state">通知はありません</div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`notification-item ${
                notification.read ? "read" : "unread"
              }`}
            >
              <div className="notification-header">
                <div className="notification-title">{notification.title}</div>
                <div className="notification-time">
                  {formatDate(notification.timestamp)}
                </div>
              </div>
              <div className="notification-body">{notification.body}</div>
              <div className="notification-actions">
                {!notification.read && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleMarkAsRead(notification.id)}
                  >
                    既読にする
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDeleteNotification(notification.id)}
                >
                  削除
                </button>
                {notification.data?.url && (
                  <a href={notification.data.url} className="btn">
                    開く
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 疎通確認セクション */}
      <div
        className="connection-test"
        style={{
          marginTop: "20px",
          padding: "15px",
          border: "1px solid #ddd",
          borderRadius: "5px",
        }}
      >
        <h2 style={{ fontSize: "16px", marginBottom: "10px" }}>
          システム疎通確認
        </h2>
        <button
          className="btn btn-primary"
          onClick={runConnectionTest}
          disabled={connectionTestRunning}
          style={{ marginBottom: "15px" }}
        >
          {connectionTestRunning ? "テスト実行中..." : "疎通テスト実行"}
        </button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "130px 1fr",
            gap: "5px",
          }}
        >
          <div style={{ fontWeight: "bold" }}>HTTPサーバー:</div>
          <div
            style={{
              color: connectionStatus.serverHttp.includes("成功")
                ? "green"
                : connectionStatus.serverHttp === "未確認"
                ? "#888"
                : "red",
            }}
          >
            {connectionStatus.serverHttp}
          </div>

          <div style={{ fontWeight: "bold" }}>WebSocketサーバー:</div>
          <div
            style={{
              color: connectionStatus.serverWs.includes("成功")
                ? "green"
                : connectionStatus.serverWs === "未確認"
                ? "#888"
                : "red",
            }}
          >
            {connectionStatus.serverWs}
          </div>

          <div style={{ fontWeight: "bold" }}>クライアント→SW:</div>
          <div
            style={{
              color: connectionStatus.serviceWorker.includes("成功")
                ? "green"
                : connectionStatus.serviceWorker === "未確認"
                ? "#888"
                : "red",
            }}
          >
            {connectionStatus.serviceWorker}
          </div>

          <div style={{ fontWeight: "bold" }}>サーバー→SW:</div>
          <div
            style={{
              color: connectionStatus.serverToSw.includes("成功")
                ? "green"
                : connectionStatus.serverToSw === "未確認"
                ? "#888"
                : "red",
            }}
          >
            {connectionStatus.serverToSw}
          </div>
        </div>
      </div>

      {/* デバッグ情報 */}
      <div style={{ marginTop: "20px", fontSize: "12px", color: "#888" }}>
        <p>通知許可: {permissionGranted ? "許可済み" : "未許可"}</p>
        <p>Service Worker: {serviceWorkerRegistered ? "登録済み" : "未登録"}</p>
        <p>プッシュ購読: {subscribed ? "購読中" : "未購読"}</p>
        {error && <p style={{ color: "red" }}>エラー: {error.message}</p>}
      </div>
    </div>
  );
};

export default NotificationSystem;
