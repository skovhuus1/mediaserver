import { receiverHtml } from './receiver-page';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(receiverHtml, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache, must-revalidate',
      'content-security-policy': "default-src 'self' https://www.gstatic.com; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src *; media-src * blob:; img-src * data: blob:; style-src 'self' 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
    },
  });
}
