'use client';

import { useState, useEffect } from 'react';
import { ApolloClient, InMemoryCache, ApolloProvider, split, HttpLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import NotificationSystem from '@/components/NotificationSystem';

export default function Home() {
  const [client, setClient] = useState<ApolloClient<any> | null>(null);

  useEffect(() => {
    // HTTP接続
    const httpLink = new HttpLink({
      uri: 'http://localhost:4000/graphql',
    });

    // WebSocket接続
    const wsLink = new GraphQLWsLink(
      createClient({
        url: 'ws://localhost:4000/graphql',
        connectionParams: {
          // 必要に応じて認証情報などを追加
        },
        shouldRetry: true,
      })
    );

    // リクエストの種類に応じて接続先を選択
    const splitLink = split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === 'OperationDefinition' &&
          definition.operation === 'subscription'
        );
      },
      wsLink,
      httpLink
    );

    // Apolloクライアントの初期化
    const apolloClient = new ApolloClient({
      link: splitLink,
      cache: new InMemoryCache(),
    });

    setClient(apolloClient);
  }, []);

  if (!client) {
    return <div>Loading...</div>;
  }

  return (
    <ApolloProvider client={client}>
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <h1 className="text-4xl font-bold mb-8">Web通知システム</h1>
        <NotificationSystem />
      </main>
    </ApolloProvider>
  );
}