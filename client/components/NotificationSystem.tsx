import React, { useState, useEffect } from 'react';
import { useQuery, gql } from '@apollo/client';
import {
  Notification,
  getNotificationHistory,
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPushNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearNotificationHistory,
  sendTestNotification
} from '@/utils/notification';

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [serviceWorkerRegistered, setServiceWorkerRegistered] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  
  // GraphQLサブスクリプション
  // Apolloクライアントで通知サブスクリプションを使用
  const { data, loading, error } = useQuery(gql`
    query GetNotifications {
      getNotifications {
        id
        title
        body
      }
    }
  `, {
    fetchPolicy: 'network-only'
  });

  // マウント時の初期化
  useEffect(() => {
    // LocalStorageから通知履歴を読み込む
    const storedNotifications = getNotificationHistory();
    setNotifications(storedNotifications);
    setUnreadCount(storedNotifications.filter(n => !n.read).length);
    
    // 通知権限の確認
    checkNotificationPermission();
    
    // Service Workerの登録
    initServiceWorker();
    
    // メッセージリスナーを設定
    setupMessageListeners();
    
    return () => {
      // クリーンアップ
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  // GraphQLサブスクリプションによる通知データの取得（デモ用）
  useEffect(() => {
    if (data && data.getNotifications) {
      console.log('GraphQLから取得した通知データ:', data.getNotifications);
    }
  }, [data]);

  // 通知権限の確認
  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      setPermissionGranted(Notification.permission === 'granted');
    }
  };

  // Service Workerの初期化
  const initServiceWorker = async () => {
    try {
      const registration = await registerServiceWorker();
      if (registration) {
        setServiceWorkerRegistered(true);
        
        // プッシュ通知の許可があれば自動的にサブスクライブ
        if (Notification.permission === 'granted') {
          const subscription = await subscribeToPushNotifications(registration);
          if (subscription) {
            setSubscribed(true);
          }
        }
      }
    } catch (error) {
      console.error('Service Workerの初期化に失敗:', error);
    }
  };

  // Service Workerからのメッセージを処理
  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data) {
      console.log('Service Workerからメッセージを受信:', event.data);
      
      // 通知の保存
      if (event.data.type === 'SAVE_NOTIFICATION') {
        const { notification } = event.data;
        handleNewNotification(notification);
      }
      
      // 通知クリック
      if (event.data.type === 'NOTIFICATION_CLICKED') {
        const { notification } = event.data;
        
        // 通知IDがあれば既読にする
        if (notification && notification.data && notification.data.id) {
          handleMarkAsRead(notification.data.id);
        }
      }
    }
  };

  // メッセージリスナーの設定
  const setupMessageListeners = () => {
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
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
      type: notification.type || 'default',
      timestamp: notification.timestamp || Date.now(),
      read: false,
      data: notification.data || {}
    };
    
    // 重複チェック
    const isDuplicate = history.some(n => n.id === newNotification.id);
    if (!isDuplicate) {
      history.unshift(newNotification);
      
      // 最大保存数を超えた場合、古いものから削除
      const MAX_NOTIFICATIONS = 50;
      if (history.length > MAX_NOTIFICATIONS) {
        history = history.slice(0, MAX_NOTIFICATIONS);
      }
      
      // LocalStorageに保存
      localStorage.setItem('notificationHistory', JSON.stringify(history));
    }
    
    // 未読の通知数を取得
    const unreadCount = history.filter(n => !n.read).length;
    
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
      console.error('テスト通知の送信に失敗:', error);
      alert('テスト通知の送信に失敗しました');
    }
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
    if (window.confirm('すべての通知を削除してもよろしいですか？')) {
      const result = clearNotificationHistory();
      setNotifications(result.history);
      setUnreadCount(result.unreadCount);
    }
  };

  // 日付のフォーマット
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
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
              ? '通知は有効です'
              : permissionGranted
              ? '通知サブスクリプションを有効にする'
              : '通知を有効にする'}
          </button>
          {' '}
          <button className="btn btn-secondary" onClick={handleSendTestNotification}>
            テスト通知を送信
          </button>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={handleMarkAllAsRead} disabled={unreadCount === 0}>
            すべて既読にする
          </button>
          {' '}
          <button className="btn btn-secondary" onClick={handleClearAll} disabled={notifications.length === 0}>
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
              className={`notification-item ${notification.read ? 'read' : 'unread'}`}
            >
              <div className="notification-header">
                <div className="notification-title">{notification.title}</div>
                <div className="notification-time">{formatDate(notification.timestamp)}</div>
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

      {/* デバッグ情報 */}
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
        <p>通知許可: {permissionGranted ? '許可済み' : '未許可'}</p>
        <p>Service Worker: {serviceWorkerRegistered ? '登録済み' : '未登録'}</p>
        <p>プッシュ購読: {subscribed ? '購読中' : '未購読'}</p>
        {error && <p style={{ color: 'red' }}>エラー: {error.message}</p>}
      </div>
    </div>
  );
};

export default NotificationSystem;