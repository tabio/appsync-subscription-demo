exports.handler = async (event: any) => {
  const authToken: string = event.authorizationToken ?? '';

  // 認証トークンがhogeの場合のみ認証を通す
  return {
    isAuthorized: authToken === 'hoge',
  };
};