interface Env {
  RATED_N_API: Fetcher;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const upstream = new URL(request.url);
  upstream.hostname = 'rated-n-api.internal';
  upstream.protocol = 'https:';
  const proxied = new Request(upstream, request);
  return env.RATED_N_API.fetch(proxied);
};
