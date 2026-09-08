import https from 'https';
import http from 'http';

const RSS_SOURCES = [
  { url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', name: 'Agência Brasil' },
  { url: 'https://www.infomoney.com.br/feed/', name: 'InfoMoney' },
  { url: 'https://exame.com/feed/', name: 'Exame' },
];

function httpGet(url: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GestorFinanceiro/1.0)' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect
        httpGet(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function parseRssItems(xml: string, sourceName: string, count = 5) {
  const items: { title: string; url: string; source: string; publishedAt: string }[] = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && items.length < count) {
    const block = m[1];
    const title = (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block) || [])[1]?.trim() ?? '';
    const link  = (/<link>([\s\S]*?)<\/link>/.exec(block) || /<guid[^>]*>([\s\S]*?)<\/guid>/.exec(block) || [])[1]?.trim() ?? '';
    const pubDate = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block) || [])[1]?.trim() ?? '';
    if (title && link) items.push({ title, url: link, source: sourceName, publishedAt: pubDate });
  }
  return items;
}

export default async function handler(req: any, res: any) {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=300');

  for (const source of RSS_SOURCES) {
    try {
      const xml = await httpGet(source.url);
      const items = parseRssItems(xml, source.name, 5);
      if (items.length > 0) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, items, source: source.name }));
        return;
      }
    } catch {
      // try next source
    }
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: false, items: [] }));
}
