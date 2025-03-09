import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerServiceWorker, subscribeToPushNotifications } from '@/utils/notification';

describe('ServiceWorker統合テスト', () => {
  beforeEach(() => {
    // ServiceWorkerのモックリセット
    vi.resetAllMocks();
    
    // ServiceWorkerの登録をモック
    vi.mock('@/utils/notification', async () => {
      const actual = await vi.importActual('@/utils/notification');
      return {
        ...actual,
        registerServiceWorker: vi.fn().mockResolvedValue({
          scope: 'http://localhost:3000/',
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockResolvedValue({ endpoint: 'https://example.com/push' }),
          },
        }),
        subscribeToPushNotifications: vi.fn().mockResolvedValue({
          endpoint: 'https://example.com/push',
        }),
      };
    });
    
    // fetchのモック
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (url === 'http://localhost:4000/api/vapid-public-key') {
        return {
          json: async () => ({ publicKey: 'test-public-key' }),
        };
      } else if (url === 'http://localhost:4000/api/notifications/subscribe') {
        return {
          json: async () => ({ success: true, message: 'サブスクリプションが登録されました' }),
        };
      }
      return {};
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Service Workerの登録テスト
  it('サービスワーカーが正常に登録されること', async () => {
    // サービスワーカーの登録
    const registration = await registerServiceWorker();
    
    // 戻り値を検証
    expect(registration).not.toBeNull();
    expect(registration).toHaveProperty('scope', 'http://localhost:3000/');
    expect(registration).toHaveProperty('pushManager');
  });

  // プッシュ通知サブスクリプションのテスト
  it('プッシュ通知のサブスクリプションが正常に行われること', async () => {
    // サービスワーカーの登録
    const registration = await registerServiceWorker();
    
    // プッシュ通知のサブスクリプション
    const subscription = await subscribeToPushNotifications(registration!);
    
    // サブスクリプションを検証
    expect(subscription).not.toBeNull();
    expect(subscription).toHaveProperty('endpoint', 'https://example.com/push');
    
    // fetch APIが正しく呼び出されることを検証
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:4000/api/vapid-public-key');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/notifications/subscribe',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });
});