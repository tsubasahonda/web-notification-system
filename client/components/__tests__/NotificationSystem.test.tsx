import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationSystem from '../NotificationSystem';
import * as notificationUtils from '@/utils/notification';

// モックのインポート
vi.mock('@/utils/notification');

describe('NotificationSystem', () => {
  // セットアップとクリーンアップ
  beforeEach(() => {
    // localStorage のモックをクリア
    window.localStorage.clear();
    
    // モック関数をリセット
    vi.clearAllMocks();
    
    // mockReturnValue の初期値を設定
    vi.mocked(notificationUtils.getNotificationHistory).mockReturnValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // 基本的なレンダリングテスト
  it('正しくコンポーネントがレンダリングされること', () => {
    render(<NotificationSystem />);
    
    // 通知センターのタイトルが存在すること
    expect(screen.getByText('通知センター')).toBeInTheDocument();
    
    // 通知がない場合は「通知はありません」と表示されること
    expect(screen.getByText('通知はありません')).toBeInTheDocument();
    
    // 通知ボタンが存在すること
    expect(screen.getByText(/通知を有効にする/)).toBeInTheDocument();
    expect(screen.getByText('テスト通知を送信')).toBeInTheDocument();
    
    // デバッグ情報が表示されていること
    expect(screen.getByText(/通知許可:/)).toBeInTheDocument();
    expect(screen.getByText(/Service Worker:/)).toBeInTheDocument();
  });

  // 通知がある場合のテスト
  it('通知がある場合、通知リストが表示されること', () => {
    // モックの通知データを設定
    const mockNotifications = [
      {
        id: '1',
        title: 'テスト通知1',
        body: 'これはテスト通知1です',
        type: 'test',
        timestamp: Date.now(),
        read: false,
        data: { url: '/test1' }
      },
      {
        id: '2',
        title: 'テスト通知2',
        body: 'これはテスト通知2です',
        type: 'test',
        timestamp: Date.now() - 1000 * 60,
        read: true,
        data: {}
      }
    ];
    
    // 通知履歴の取得メソッドをモック
    vi.mocked(notificationUtils.getNotificationHistory).mockReturnValue(mockNotifications);
    
    render(<NotificationSystem />);
    
    // 通知タイトルが表示されていること
    expect(screen.getByText('テスト通知1')).toBeInTheDocument();
    expect(screen.getByText('テスト通知2')).toBeInTheDocument();
    
    // 通知の本文が表示されていること
    expect(screen.getByText('これはテスト通知1です')).toBeInTheDocument();
    expect(screen.getByText('これはテスト通知2です')).toBeInTheDocument();
    
    // 未読通知には「既読にする」ボタンがあること
    expect(screen.getByText('既読にする')).toBeInTheDocument();
    
    // すべての通知には「削除」ボタンがあること
    expect(screen.getAllByText('削除')).toHaveLength(2);
    
    // URLがある通知には「開く」リンクがあること
    expect(screen.getByText('開く')).toBeInTheDocument();
  });

  // 通知の既読処理のテスト
  it('「既読にする」ボタンをクリックすると、既読処理が行われること', async () => {
    const user = userEvent.setup();
    
    // モックの通知データを設定
    const mockNotifications = [
      {
        id: '1',
        title: 'テスト通知1',
        body: 'これはテスト通知1です',
        type: 'test',
        timestamp: Date.now(),
        read: false,
        data: {}
      }
    ];
    
    // 通知履歴の取得メソッドをモック
    vi.mocked(notificationUtils.getNotificationHistory).mockReturnValue(mockNotifications);
    
    // 既読処理メソッドをモック
    vi.mocked(notificationUtils.markNotificationAsRead).mockReturnValue({
      history: [{ ...mockNotifications[0], read: true }],
      unreadCount: 0
    });
    
    render(<NotificationSystem />);
    
    // 「既読にする」ボタンをクリック
    const readButton = screen.getByText('既読にする');
    await user.click(readButton);
    
    // 既読処理関数が呼ばれること
    expect(notificationUtils.markNotificationAsRead).toHaveBeenCalledWith('1');
  });

  // すべて既読処理のテスト
  it('「すべて既読にする」ボタンをクリックすると、全既読処理が行われること', async () => {
    const user = userEvent.setup();
    
    // モックの通知データを設定（2つとも未読）
    const mockNotifications = [
      {
        id: '1',
        title: 'テスト通知1',
        body: 'これはテスト通知1です',
        type: 'test',
        timestamp: Date.now(),
        read: false,
        data: {}
      },
      {
        id: '2',
        title: 'テスト通知2',
        body: 'これはテスト通知2です',
        type: 'test',
        timestamp: Date.now() - 1000 * 60,
        read: false,
        data: {}
      }
    ];
    
    // 通知履歴の取得メソッドをモック
    vi.mocked(notificationUtils.getNotificationHistory).mockReturnValue(mockNotifications);
    
    // 全既読処理メソッドをモック
    vi.mocked(notificationUtils.markAllNotificationsAsRead).mockReturnValue({
      history: mockNotifications.map(n => ({ ...n, read: true })),
      unreadCount: 0
    });
    
    render(<NotificationSystem />);
    
    // 「すべて既読にする」ボタンをクリック
    const markAllReadButton = screen.getByText('すべて既読にする');
    await user.click(markAllReadButton);
    
    // 全既読処理関数が呼ばれること
    expect(notificationUtils.markAllNotificationsAsRead).toHaveBeenCalled();
  });

  // 通知の削除テスト
  it('「削除」ボタンをクリックすると、通知が削除されること', async () => {
    const user = userEvent.setup();
    
    // モックの通知データを設定
    const mockNotifications = [
      {
        id: '1',
        title: 'テスト通知1',
        body: 'これはテスト通知1です',
        type: 'test',
        timestamp: Date.now(),
        read: false,
        data: {}
      }
    ];
    
    // 通知履歴の取得メソッドをモック
    vi.mocked(notificationUtils.getNotificationHistory).mockReturnValue(mockNotifications);
    
    // 削除処理メソッドをモック
    vi.mocked(notificationUtils.deleteNotification).mockReturnValue({
      history: [],
      unreadCount: 0
    });
    
    render(<NotificationSystem />);
    
    // 「削除」ボタンをクリック
    const deleteButton = screen.getByText('削除');
    await user.click(deleteButton);
    
    // 削除処理関数が呼ばれること
    expect(notificationUtils.deleteNotification).toHaveBeenCalledWith('1');
  });

  // すべての通知の削除テスト
  it('「すべて削除」ボタンをクリックすると、全通知が削除されること', async () => {
    const user = userEvent.setup();
    
    // モックの通知データを設定
    const mockNotifications = [
      {
        id: '1',
        title: 'テスト通知1',
        body: 'これはテスト通知1です',
        type: 'test',
        timestamp: Date.now(),
        read: false,
        data: {}
      },
      {
        id: '2',
        title: 'テスト通知2',
        body: 'これはテスト通知2です',
        type: 'test',
        timestamp: Date.now() - 1000 * 60,
        read: true,
        data: {}
      }
    ];
    
    // 通知履歴の取得メソッドをモック
    vi.mocked(notificationUtils.getNotificationHistory).mockReturnValue(mockNotifications);
    
    // 全削除処理メソッドをモック
    vi.mocked(notificationUtils.clearNotificationHistory).mockReturnValue({
      history: [],
      unreadCount: 0
    });
    
    // window.confirm はvitest.setup.tsで常にtrueを返すようにモック済み
    
    render(<NotificationSystem />);
    
    // 「すべて削除」ボタンをクリック
    const clearAllButton = screen.getByText('すべて削除');
    await user.click(clearAllButton);
    
    // 全削除処理関数が呼ばれること
    expect(notificationUtils.clearNotificationHistory).toHaveBeenCalled();
  });

  // 通知許可のリクエストテスト
  it('「通知を有効にする」ボタンをクリックすると、通知許可がリクエストされること', async () => {
    const user = userEvent.setup();
    
    render(<NotificationSystem />);
    
    // 「通知を有効にする」ボタンをクリック
    const enableButton = screen.getByText(/通知を有効にする/);
    await user.click(enableButton);
    
    // 通知許可リクエスト関数が呼ばれること
    expect(notificationUtils.requestNotificationPermission).toHaveBeenCalled();
  });

  // テスト通知の送信テスト
  it('「テスト通知を送信」ボタンをクリックすると、テスト通知が送信されること', async () => {
    const user = userEvent.setup();
    
    render(<NotificationSystem />);
    
    // 「テスト通知を送信」ボタンをクリック
    const testButton = screen.getByText('テスト通知を送信');
    await user.click(testButton);
    
    // テスト通知送信関数が呼ばれること
    expect(notificationUtils.sendTestNotification).toHaveBeenCalled();
  });

  // エラーハンドリングのテスト（テスト通知送信失敗）
  it('テスト通知の送信に失敗した場合、エラーが処理されること', async () => {
    const user = userEvent.setup();
    
    // テスト通知送信関数のモックをエラーを投げるように設定
    vi.mocked(notificationUtils.sendTestNotification).mockRejectedValue(new Error('送信失敗'));
    
    // alertをモック
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    
    render(<NotificationSystem />);
    
    // 「テスト通知を送信」ボタンをクリック
    const testButton = screen.getByText('テスト通知を送信');
    await user.click(testButton);
    
    // エラーがコンソールに出力されることを確認
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('テスト通知の送信に失敗しました');
    });
  });
});